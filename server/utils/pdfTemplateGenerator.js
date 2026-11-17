import fs from "fs";
import path from "path";
import {
  PDFDocument,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  StandardFonts,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from "pdf-lib";
import {
  inspectPdfTemplate,
  resolveTaxInvoicePdfLayout,
  resolveNonGstInvoicePdfLayout,
  resolveQuotationPdfLayout,
  resolveContractRenewalPdfLayout,
  resolveOneTimeJobPdfLayout,
  resolveAttQuotationPdfLayout,
  sanitizePdfText,
  PdfTemplateValidationError,
} from "./pdfTemplateInspector.js";

// ============================================================
// TEXT WRAPPING & MEASUREMENT UTILITIES (FEATURE 2)
// ============================================================

/**
 * Wraps text using exact font metrics and specified maximum width in points.
 * Handles existing newlines, words, and long words exceeding maxWidth.
 */
export function wrapTextByFontMetrics(text, maxWidth, font, fontSize) {
  const safeInput = sanitizePdfText(text);
  if (!safeInput || safeInput.trim() === "") {
    return [""];
  }

  const rawParagraphs = safeInput.split(/\r?\n/);
  const lines = [];

  for (const para of rawParagraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) {
      lines.push("");
      continue;
    }

    const words = trimmedPara.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, fontSize);

      if (width <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
          // Check if single word exceeds maxWidth
          if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
            let partial = "";
            for (let c = 0; c < word.length; c++) {
              const charCandidate = partial + word[c];
              if (font.widthOfTextAtSize(charCandidate, fontSize) <= maxWidth) {
                partial = charCandidate;
              } else {
                if (partial) lines.push(partial);
                partial = word[c];
              }
            }
            currentLine = partial;
          }
        } else {
          // First word on line exceeds maxWidth: break by characters
          let partial = "";
          for (let c = 0; c < word.length; c++) {
            const charCandidate = partial + word[c];
            if (font.widthOfTextAtSize(charCandidate, fontSize) <= maxWidth) {
              partial = charCandidate;
            } else {
              if (partial) lines.push(partial);
              partial = word[c];
            }
          }
          currentLine = partial;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines.length > 0 ? lines : [""];
}

/**
 * Draws a labeled field with hanging-indent alignment:
 * - Label is drawn at (x, y)
 * - Value starts at valueStartX = x + labelWidth + labelGap
 * - When value wraps, ALL continuation lines start at the exact same valueStartX!
 * - Available width is calculated as maxX - valueStartX
 */
export function drawLabeledWrappedField(page, {
  label = "",
  value = "",
  x,
  y,
  maxX,
  fontRegular,
  fontBold,
  fontSize = 9.5,
  color = rgb(0, 0, 0),
  lineSpacing = 12,
  labelGap = 5,
  targetValueStartX = null,
  coverBg = null,
  coverHeight = null,
  breakBeforeValueIfOverflow = false,
  wrapValueIndent = 0,
}) {
  const labelStr = sanitizePdfText(label || "");
  const valueStr = sanitizePdfText(value || "");

  const naturalLabelWidth = labelStr ? fontBold.widthOfTextAtSize(labelStr, fontSize) : 0;
  const naturalStartX = labelStr ? x + naturalLabelWidth + labelGap : x;
  const valueStartX = targetValueStartX && targetValueStartX > naturalStartX ? targetValueStartX : naturalStartX;
  const availableValueWidth = Math.max(20, maxX - valueStartX);

  let isWrappedUnder = false;
  let valueLines;

  if (breakBeforeValueIfOverflow && labelStr && valueStr) {
    const valueWidth = fontRegular.widthOfTextAtSize(valueStr, fontSize);
    if (valueWidth > availableValueWidth) {
      isWrappedUnder = true;
      const fullAvailableWidth = Math.max(20, maxX - (x + wrapValueIndent));
      valueLines = wrapTextByFontMetrics(valueStr, fullAvailableWidth, fontRegular, fontSize);
    } else {
      valueLines = [valueStr];
    }
  } else {
    valueLines = wrapTextByFontMetrics(
      valueStr,
      availableValueWidth,
      fontRegular,
      fontSize
    );
  }

  // Optional background rectangle to cover old template placeholder
  if (coverBg) {
    const totalLines = isWrappedUnder ? 1 + valueLines.length : Math.max(valueLines.length, 1);
    const rectHeight = coverHeight ? Math.max(coverHeight, totalLines * lineSpacing + 4) : totalLines * lineSpacing + 4;
    page.drawRectangle({
      x: x - 2,
      y: y - rectHeight + fontSize + 2,
      width: maxX - x + 4,
      height: rectHeight,
      color: coverBg,
    });
  }

  // Draw label on first line
  if (labelStr) {
    page.drawText(labelStr, {
      x,
      y,
      size: fontSize,
      font: fontBold,
      color,
    });
  }

  if (isWrappedUnder) {
    // Value starts on the NEXT line under the label
    valueLines.forEach((line, idx) => {
      if (line) {
        page.drawText(line, {
          x: x + wrapValueIndent,
          y: y - (idx + 1) * lineSpacing,
          size: fontSize,
          font: fontRegular,
          color,
        });
      }
    });
    return {
      totalLines: 1 + valueLines.length,
      bottomY: y - valueLines.length * lineSpacing,
      valueStartX: x + wrapValueIndent,
      isWrappedUnder: true,
    };
  }

  // Draw value lines: continuation lines start at exact same valueStartX
  valueLines.forEach((line, idx) => {
    if (line) {
      page.drawText(line, {
        x: valueStartX,
        y: y - idx * lineSpacing,
        size: fontSize,
        font: fontRegular,
        color,
      });
    }
  });

  return {
    totalLines: valueLines.length,
    bottomY: y - (valueLines.length - 1) * lineSpacing,
    valueStartX,
    isWrappedUnder: false,
  };
}

/**
 * Draws wrapped cell text inside a table column with uniform left padding.
 */
export function drawCellWrappedText(page, {
  text = "",
  x,
  y,
  width,
  font,
  fontSize = 9,
  color = rgb(0, 0, 0),
  lineSpacing = 11,
}) {
  const lines = wrapTextByFontMetrics(text, width, font, fontSize);

  lines.forEach((line, idx) => {
    if (line) {
      page.drawText(line, {
        x,
        y: y - idx * lineSpacing,
        size: fontSize,
        font,
        color,
      });
    }
  });

  return {
    lines,
    lineCount: lines.length,
    bottomY: y - (lines.length - 1) * lineSpacing,
  };
}

function measureLabeledField(
  label,
  value,
  x,
  maxX,
  fontRegular,
  fontBold,
  fontSize,
  lineSpacing,
  labelGap = 5,
  targetValueStartX = null,
  breakBeforeValueIfOverflow = false,
  wrapValueIndent = 0
) {
  const labelStr = sanitizePdfText(label || "");
  const valueStr = sanitizePdfText(value || "");
  const naturalLabelWidth = labelStr ? fontBold.widthOfTextAtSize(labelStr, fontSize) : 0;
  const naturalStartX = labelStr ? x + naturalLabelWidth + labelGap : x;
  const valueStartX = targetValueStartX && targetValueStartX > naturalStartX ? targetValueStartX : naturalStartX;
  const availableValueWidth = Math.max(20, maxX - valueStartX);

  let isWrappedUnder = false;
  let valueLines;

  if (breakBeforeValueIfOverflow && labelStr && valueStr) {
    const valueWidth = fontRegular.widthOfTextAtSize(valueStr, fontSize);
    if (valueWidth > availableValueWidth) {
      isWrappedUnder = true;
      const fullAvailableWidth = Math.max(20, maxX - (x + wrapValueIndent));
      valueLines = wrapTextByFontMetrics(valueStr, fullAvailableWidth, fontRegular, fontSize);
    } else {
      valueLines = [valueStr];
    }
  } else {
    valueLines = wrapTextByFontMetrics(valueStr, availableValueWidth, fontRegular, fontSize);
  }

  const lineCount = isWrappedUnder ? 1 + valueLines.length : Math.max(1, valueLines.length);

  return {
    lines: valueLines,
    lineCount,
    height: lineCount * lineSpacing,
    valueStartX: isWrappedUnder ? x + wrapValueIndent : valueStartX,
    isWrappedUnder,
  };
}

function maskCellInterior(page, x0, y0, x1, y1, color = rgb(1, 1, 1), pad = 1.6) {
  const rx = x0 + pad;
  const ry = y0 + pad;
  const rw = x1 - x0 - pad * 2;
  const rh = y1 - y0 - pad * 2;
  if (rw > 0 && rh > 0) {
    page.drawRectangle({ x: rx, y: ry, width: rw, height: rh, color });
  }
}

function drawHBorder(page, x0, x1, y, thickness = 1.4, color = rgb(0, 0, 0)) {
  const half = thickness / 2;
  page.drawRectangle({
    x: Math.min(x0, x1) - half,
    y: y - half,
    width: Math.abs(x1 - x0) + thickness,
    height: thickness,
    color,
  });
}

function drawVBorder(page, x, y0, y1, thickness = 1.4, color = rgb(0, 0, 0)) {
  const half = thickness / 2;
  page.drawRectangle({
    x: x - half,
    y: Math.min(y0, y1) - half,
    width: thickness,
    height: Math.abs(y1 - y0) + thickness,
    color,
  });
}

async function selectDocumentFonts(pdfDoc, fontFamily = "serif") {
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const times = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const isSans = fontFamily === "sans";
  return {
    regular: isSans ? helvetica : times,
    bold: isSans ? helveticaBold : timesBold,
    sansRegular: helvetica,
    sansBold: helveticaBold,
    serifRegular: times,
    serifBold: timesBold,
  };
}

function drawRightAlignedText(page, text, rightEdgeX, y, size, font, color = rgb(0, 0, 0)) {
  const safe = sanitizePdfText(text);
  if (!safe) return;
  const w = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: rightEdgeX - w, y, size, font, color });
}

function drawCenteredText(page, text, x0, x1, y, size, font, color = rgb(0, 0, 0)) {
  const safe = sanitizePdfText(text);
  if (!safe) return;
  const w = font.widthOfTextAtSize(safe, size);
  const x = x0 + Math.max(2, (x1 - x0 - w) / 2);
  page.drawText(safe, { x, y, size, font, color });
}

/**
 * Re-draws an existing image XObject (e.g., company stamp / signature) defined on the
 * template page at dynamic coordinates using native pdf-lib content operators.
 */
function drawExistingPageImageXObject(page, imageBox, targetX, targetY) {
  if (!imageBox || !imageBox.name) return false;
  try {
    const cleanName = String(imageBox.name).replace(/^\//, "");
    const resources = page.node?.Resources?.();
    const xObjDict = resources?.lookup?.(PDFName.of("XObject"));
    if (
      !xObjDict ||
      (!xObjDict.get?.(PDFName.of(cleanName)) && !xObjDict.has?.(PDFName.of(cleanName)))
    ) {
      return false;
    }
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(imageBox.width, 0, 0, imageBox.height, targetX, targetY),
      PDFOperator.of(PDFOperatorNames.DrawObject, [PDFName.of(cleanName)]),
      popGraphicsState()
    );
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// 1. PC QUOTATION PDF GENERATOR (`quotation`)
// ============================================================

export async function generateQuotationPdf(
  pdfDoc,
  data,
  inspection = null,
  templateBytes = null
) {
  const pages = pdfDoc.getPages();
  if (pages.length === 0) throw new PdfTemplateValidationError("PDF template has no pages");

  const resolvedInspection =
    inspection ||
    (templateBytes
      ? await inspectPdfTemplate(templateBytes)
      : await inspectPdfTemplate(await pdfDoc.save()));
  const layout = resolveQuotationPdfLayout(resolvedInspection);
  const page1 = pages[0];

  const { regular: fontRegular, bold: fontBold } = await selectDocumentFonts(
    pdfDoc,
    layout.fontFamily
  );

  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);
  const greenBg = rgb(
    layout.greenColorRgb[0],
    layout.greenColorRgb[1],
    layout.greenColorRgb[2]
  );
  const borderW = 0.8;

  // ------------------------------------------------------------
  // 1. Top-Right Header Date & QTN NO (auto-widens cleanly if QTN NO is long)
  // ------------------------------------------------------------
  const qDate = sanitizePdfText(data.quotationDate || data.quoteDate || "");
  const qNum = sanitizePdfText(data.quotationNumber || data.quoteNumber || "");
  const metaRightMaxX = layout.pageWidth - 12;
  const maxMetaStrW = Math.max(
    qDate ? fontBold.widthOfTextAtSize(`DATE : ${qDate}`, 9.2) : 0,
    qNum ? fontBold.widthOfTextAtSize(`QTN NO : ${qNum}`, 9.2) : 0
  );
  const metaX = Math.max(380, Math.min(layout.fields.metaX, metaRightMaxX - maxMetaStrW - 4));
  let metaFontSize = 9.2;
  while (metaFontSize > 7.8) {
    const wDate = qDate ? fontBold.widthOfTextAtSize(`DATE : ${qDate}`, metaFontSize) : 0;
    const wNum = qNum ? fontBold.widthOfTextAtSize(`QTN NO : ${qNum}`, metaFontSize) : 0;
    if (Math.max(wDate, wNum) <= metaRightMaxX - metaX) break;
    metaFontSize -= 0.3;
  }

  page1.drawRectangle({
    x: Math.min(layout.fields.metaX, metaX) - 6,
    y: layout.fields.qtnY - 6,
    width: layout.pageWidth - 10 - (Math.min(layout.fields.metaX, metaX) - 6),
    height: layout.fields.dateY + 13 - (layout.fields.qtnY - 6),
    color: white,
  });

  if (qDate) {
    drawLabeledWrappedField(page1, {
      label: "DATE : ",
      value: qDate,
      x: metaX,
      y: layout.fields.dateY,
      maxX: metaRightMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: metaFontSize,
      lineSpacing: 11,
      labelGap: 2,
    });
  }
  if (qNum) {
    drawLabeledWrappedField(page1, {
      label: "QTN NO : ",
      value: qNum,
      x: metaX,
      y: layout.fields.qtnY,
      maxX: metaRightMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: metaFontSize,
      lineSpacing: 11,
      labelGap: 2,
    });
  }

  // ------------------------------------------------------------
  // 2. Customer Name & Address (fits cleanly above Reference:)
  // ------------------------------------------------------------
  const cName = sanitizePdfText(
    data.customerName || data.customerCompanyName || data.customerFullName || ""
  );
  const cAddr = sanitizePdfText(data.customerAddress || "");
  const custX = layout.fields.custX;
  const custMaxX = metaX - 10;
  const custTopY = layout.fields.custTopY;
  const custMinY = layout.fields.refY + 8;

  page1.drawRectangle({
    x: custX - 3,
    y: custMinY,
    width: custMaxX - (custX - 3),
    height: layout.fields.toY - 2 - custMinY,
    color: white,
  });

  // Auto-fit font step so long multi-line customer addresses fit cleanly above Reference:
  const sizeSteps = [
    { nameSize: 9.8, nameStep: 11.5, addrSize: 8.8, addrStep: 10.5 },
    { nameSize: 9.0, nameStep: 10.5, addrSize: 8.0, addrStep: 9.5 },
    { nameSize: 8.2, nameStep: 9.5, addrSize: 7.4, addrStep: 8.6 },
  ];
  let chosenStep = sizeSteps[sizeSteps.length - 1];
  let chosenNameLines = [];
  let chosenAddrLines = [];
  const availCustH = custTopY - custMinY + 6;
  for (const step of sizeSteps) {
    const nl = cName ? wrapTextByFontMetrics(cName, custMaxX - custX, fontBold, step.nameSize) : [];
    const al = cAddr ? wrapTextByFontMetrics(cAddr, custMaxX - custX, fontRegular, step.addrSize) : [];
    const needed = nl.length * step.nameStep + (al.length > 0 ? 2 + al.length * step.addrStep : 0);
    chosenStep = step;
    chosenNameLines = nl;
    chosenAddrLines = al;
    if (needed <= availCustH) break;
  }

  let cy = custTopY;
  for (const line of chosenNameLines) {
    if (cy < custMinY + 2) break;
    if (line) {
      page1.drawText(line, {
        x: custX,
        y: cy,
        size: chosenStep.nameSize,
        font: fontBold,
        color: black,
      });
    }
    cy -= chosenStep.nameStep;
  }
  cy -= 1.5;
  for (const line of chosenAddrLines) {
    if (cy < custMinY + 2) break;
    if (line) {
      page1.drawText(line, {
        x: custX,
        y: cy,
        size: chosenStep.addrSize,
        font: fontRegular,
        color: black,
      });
    }
    cy -= chosenStep.addrStep;
  }

  // ------------------------------------------------------------
  // 3. "Premises to be Treated" Green Banner (single border, zero truncation)
  // ------------------------------------------------------------
  const premisesText = sanitizePdfText(
    data.premisesTreated || data.premises || data.customerAddress || ""
  );
  const pb = layout.premisesBox;
  const premValueWidth = pb.rightX - pb.splitX - 14;
  const premLines = premisesText
    ? wrapTextByFontMetrics(premisesText, premValueWidth, fontBold, 9.5)
    : [""];
  const origPremH = pb.topY - pb.bottomY;
  const neededPremH = Math.max(origPremH, premLines.length * 11.5 + 12);
  const effPremBottomY = pb.topY - neededPremH;
  const premShiftDown = Math.max(0, pb.bottomY - effPremBottomY);

  // Clear old green cell area (+2pt margin) so double borders never remain
  page1.drawRectangle({
    x: pb.leftX - 2,
    y: effPremBottomY - 2,
    width: pb.rightX - pb.leftX + 4,
    height: neededPremH + 4,
    color: white,
  });
  page1.drawRectangle({
    x: pb.leftX,
    y: effPremBottomY,
    width: pb.rightX - pb.leftX,
    height: neededPremH,
    color: greenBg,
  });

  // Left cell label
  const premLabelText = "Premises to be Treated";
  const premLabelY = effPremBottomY + neededPremH / 2 - 3.5;
  drawCenteredText(
    page1,
    premLabelText,
    pb.leftX,
    pb.splitX,
    premLabelY,
    10.2,
    fontBold,
    white
  );

  // Right cell value (ALL wrapped lines, vertically balanced inside green cell)
  const premTextBlockH = premLines.length * 11.5;
  let py = effPremBottomY + (neededPremH + premTextBlockH) / 2 - 9;
  for (const line of premLines) {
    if (line) {
      page1.drawText(line, {
        x: pb.splitX + 6,
        y: py,
        size: 9.5,
        font: fontBold,
        color: white,
      });
    }
    py -= 11.5;
  }

  // Crisp single borders for Premises box
  drawHBorder(page1, pb.leftX, pb.rightX, pb.topY, borderW, black);
  drawHBorder(page1, pb.leftX, pb.rightX, effPremBottomY, borderW, black);
  drawVBorder(page1, pb.leftX, effPremBottomY, pb.topY, borderW, black);
  drawVBorder(page1, pb.splitX, effPremBottomY, pb.topY, borderW, black);
  drawVBorder(page1, pb.rightX, effPremBottomY, pb.topY, borderW, black);

  // ------------------------------------------------------------
  // 4. 5-Column Commercial Proposal Table + Dynamic Services
  // ------------------------------------------------------------
  const tbl = layout.table;
  const colX = tbl.colX;
  const headerH = tbl.headerTopY - tbl.headerBottomY;
  const effHeaderTopY = tbl.headerTopY - premShiftDown;
  const effHeaderBottomY = effHeaderTopY - headerH;

  const drawProposalTableHeader = (targetPage, hTop, hBottom) => {
    const hH = hTop - hBottom;
    targetPage.drawRectangle({
      x: colX[0] - 2,
      y: hBottom - 1.5,
      width: colX[5] - colX[0] + 4,
      height: hH + 3,
      color: white,
    });
    targetPage.drawRectangle({
      x: colX[0],
      y: hBottom,
      width: colX[5] - colX[0],
      height: hH,
      color: greenBg,
    });
    const headers = [
      { label: "NO", size: 8.5, x0: colX[0], x1: colX[1] },
      { label: "Location to be Treated", size: 9, x0: colX[1], x1: colX[2] },
      { label: "Service Name", size: 9, x0: colX[2], x1: colX[3] },
      { label: "Frequency", size: 9, x0: colX[3], x1: colX[4] },
      { label: "Service Cost", size: 9, x0: colX[4], x1: colX[5] },
    ];
    const labelY = hBottom + hH / 2 - 3.2;
    for (const h of headers) {
      drawCenteredText(targetPage, h.label, h.x0, h.x1, labelY, h.size, fontBold, white);
    }
    drawHBorder(targetPage, colX[0], colX[5], hTop, borderW, black);
    drawHBorder(targetPage, colX[0], colX[5], hBottom, borderW, black);
    for (const vx of colX) {
      drawVBorder(targetPage, vx, hBottom, hTop, borderW, black);
    }
  };

  const services =
    Array.isArray(data.services) && data.services.length > 0
      ? data.services
      : [
          {
            serviceNumber: "1",
            location: premisesText,
            serviceName: data.treatmentType || "Pest Control Treatment",
            frequency: data.billingTerm || "Monthly",
            amount: data.totalAmount || "0.00",
          },
        ];

  const locWidth = colX[2] - colX[1] - 12;
  const nameWidth = colX[3] - colX[2] - 12;
  const freqWidth = colX[4] - colX[3] - 10;

  const serviceRows = services.map((service, index) => {
    const numStr = sanitizePdfText(String(service.serviceNumber || index + 1));
    const location = sanitizePdfText(service.location || service.address || premisesText || "");
    const name = sanitizePdfText(service.serviceName || service.name || "");
    const freq = sanitizePdfText(service.frequency || "");
    const costRaw =
      service.amount !== undefined
        ? String(service.amount)
        : service.cost !== undefined
          ? String(service.cost)
          : "0.00";
    const cost = sanitizePdfText(costRaw);

    const locLines = wrapTextByFontMetrics(location, locWidth, fontRegular, 9);
    const nameLines = wrapTextByFontMetrics(name, nameWidth, fontRegular, 9);
    const freqLines = wrapTextByFontMetrics(freq, freqWidth, fontRegular, 8.8);
    const maxLines = Math.max(locLines.length, nameLines.length, freqLines.length, 1);
    const rowHeight = Math.max(26, maxLines * 11.5 + 11);
    return {
      numStr,
      locLines,
      nameLines,
      freqLines,
      cost,
      rowHeight,
    };
  });

  const drawProposalServiceRow = (targetPage, row, rowTopY) => {
    const rowBottomY = rowTopY - row.rowHeight;
    const midY = rowBottomY + row.rowHeight / 2 - 3.5;

    drawCenteredText(targetPage, row.numStr, colX[0], colX[1], midY, 9.5, fontBold, black);

    row.locLines.forEach((line, lIdx) => {
      if (line) {
        targetPage.drawText(line, {
          x: colX[1] + 6,
          y: rowTopY - 13 - lIdx * 11.5,
          size: 9,
          font: fontRegular,
          color: black,
        });
      }
    });

    row.nameLines.forEach((line, nIdx) => {
      if (line) {
        targetPage.drawText(line, {
          x: colX[2] + 6,
          y: rowTopY - 13 - nIdx * 11.5,
          size: 9,
          font: fontRegular,
          color: black,
        });
      }
    });

    const freqStartY = row.freqLines.length > 1 ? rowTopY - 13 : midY;
    row.freqLines.forEach((line, fIdx) => {
      if (line) {
        drawCenteredText(
          targetPage,
          line,
          colX[3],
          colX[4],
          freqStartY - fIdx * 11.5,
          8.8,
          fontRegular,
          black
        );
      }
    });

    drawRightAlignedText(targetPage, row.cost, colX[5] - 8, midY, 9.2, fontRegular, black);

    drawHBorder(targetPage, colX[0], colX[5], rowBottomY, borderW, black);
    for (const vx of colX) {
      drawVBorder(targetPage, vx, rowBottomY, rowTopY, borderW, black);
    }
    return rowBottomY;
  };

  // ------------------------------------------------------------
  // 5. Measure Dynamic Footer (Terms + Closing + Signature + Stamp)
  // ------------------------------------------------------------
  const totalRowHeight = 26.5;
  const totalAmountStr = sanitizePdfText(
    data.totalAmount || data.grandTotal || data.total || "0.00"
  );
  const footerX = 28.32;
  const footerMaxX = colX[5] - 2;
  const payTermStr = sanitizePdfText(
    data.paymentTerms || data.paymentTerm || "Within 10 days from the date of invoice submission."
  );
  const billTermStr = sanitizePdfText(data.billingTerm || data.billingTerms || "Monthly");
  const gstNoteStr = "•   The above quote is exclusive of GST and will be charged as per applicable rate.";
  const payTermM = measureLabeledField(
    "Payment Term : ",
    payTermStr,
    footerX + 12.5,
    footerMaxX,
    fontRegular,
    fontBold,
    9.2,
    11.5,
    3
  );
  const billTermM = measureLabeledField(
    "Billing Term : ",
    billTermStr,
    footerX + 12.5,
    footerMaxX,
    fontRegular,
    fontBold,
    9.2,
    11.5,
    3
  );
  const closingStr =
    "We trust that our proposed solution is acceptable to you and we await your favourable reply. Thank you for your interest in Samarth Pest Management.";
  const closingLines = wrapTextByFontMetrics(closingStr, footerMaxX - footerX, fontRegular, 9);
  const stampH = layout.stampImage ? layout.stampImage.height : 24;
  const footerTotalH =
    14 +
    14 +
    (payTermM.height + 3) +
    (billTermM.height + 6) +
    (closingLines.length * 11 + 6) +
    14 +
    stampH +
    14;

  const drawTotalAndFooter = (targetPage, tableEndY) => {
    const totalBottomY = tableEndY - totalRowHeight;
    const midY = totalBottomY + totalRowHeight / 2 - 3.5;

    const totalLabel = "TOTAL AMOUNT";
    const totalLabelW = fontBold.widthOfTextAtSize(totalLabel, 10);
    targetPage.drawText(totalLabel, {
      x: colX[4] - 18 - totalLabelW,
      y: midY,
      size: 10,
      font: fontBold,
      color: black,
    });
    drawRightAlignedText(targetPage, totalAmountStr, colX[5] - 8, midY, 9.5, fontBold, black);

    drawHBorder(targetPage, colX[0], colX[5], totalBottomY, borderW, black);
    drawVBorder(targetPage, colX[0], totalBottomY, tableEndY, borderW, black);
    drawVBorder(targetPage, colX[4], totalBottomY, tableEndY, borderW, black);
    drawVBorder(targetPage, colX[5], totalBottomY, tableEndY, borderW, black);

    let fy = totalBottomY - 14;
    targetPage.drawText(gstNoteStr, {
      x: footerX,
      y: fy,
      size: 9.2,
      font: fontRegular,
      color: black,
    });
    fy -= 14;

    targetPage.drawText("•", { x: footerX, y: fy, size: 9.2, font: fontRegular, color: black });
    const payRes = drawLabeledWrappedField(targetPage, {
      label: "Payment Term : ",
      value: payTermStr,
      x: footerX + 12.5,
      y: fy,
      maxX: footerMaxX,
      fontRegular,
      fontBold,
      fontSize: 9.2,
      lineSpacing: 11.5,
      labelGap: 3,
    });
    fy = payRes.bottomY - 13.5;

    targetPage.drawText("•", { x: footerX, y: fy, size: 9.2, font: fontRegular, color: black });
    const billRes = drawLabeledWrappedField(targetPage, {
      label: "Billing Term : ",
      value: billTermStr,
      x: footerX + 12.5,
      y: fy,
      maxX: footerMaxX,
      fontRegular,
      fontBold,
      fontSize: 9.2,
      lineSpacing: 11.5,
      labelGap: 3,
    });
    fy = billRes.bottomY - 14;

    for (const line of closingLines) {
      if (line) {
        targetPage.drawText(line, {
          x: footerX,
          y: fy,
          size: 9,
          font: fontRegular,
          color: black,
        });
      }
      fy -= 11;
    }
    fy -= 5;

    targetPage.drawText("Yours faithfully,", {
      x: footerX + 14,
      y: fy,
      size: 9.5,
      font: fontRegular,
      color: black,
    });

    if (layout.stampImage) {
      const stampX = layout.stampImage.x0;
      const stampY = fy - layout.stampImage.height - 3;
      drawExistingPageImageXObject(targetPage, layout.stampImage, stampX, stampY);
      fy = stampY - 10;
    } else {
      fy -= 28;
    }

    targetPage.drawText("For Samarth Pest Management", {
      x: footerX,
      y: fy,
      size: 9,
      font: fontBold,
      color: black,
    });
  };

  // ------------------------------------------------------------
  // 6. Render Single-Page or Multi-Page Continuation (BEFORE Annexure II!)
  // ------------------------------------------------------------
  const totalServicesH = serviceRows.reduce((acc, r) => acc + r.rowHeight, 0);
  const page1MinY = 34;
  const page1AvailH = effHeaderBottomY - page1MinY;

  if (totalServicesH + totalRowHeight + footerTotalH <= page1AvailH) {
    page1.drawRectangle({
      x: 0,
      y: 0,
      width: layout.pageWidth,
      height: effPremBottomY - 0.8,
      color: white,
    });
    drawProposalTableHeader(page1, effHeaderTopY, effHeaderBottomY);

    let ry = effHeaderBottomY;
    for (const row of serviceRows) {
      ry = drawProposalServiceRow(page1, row, ry);
    }
    drawTotalAndFooter(page1, ry);
    return pdfDoc;
  }

  // Multi-page overflow path (preserve Annexure II at the very end!)
  const cleanBytes = templateBytes || (await pdfDoc.save());
  const templateCopyDoc = await PDFDocument.load(cleanBytes);

  const page1ContBottomY = 58;
  page1.drawRectangle({
    x: 0,
    y: 0,
    width: layout.pageWidth,
    height: effPremBottomY - 0.8,
    color: white,
  });
  drawProposalTableHeader(page1, effHeaderTopY, effHeaderBottomY);

  const reserveLimit = serviceRows.length > 1 ? serviceRows.length - 1 : 0;
  let nextIdx = 0;
  let p1Y = effHeaderBottomY;
  while (nextIdx < reserveLimit) {
    const row = serviceRows[nextIdx];
    if (p1Y - row.rowHeight < page1ContBottomY && nextIdx > 0) break;
    p1Y = drawProposalServiceRow(page1, row, p1Y);
    nextIdx++;
  }
  drawRightAlignedText(
    page1,
    "Continued on next page...",
    colX[5] - 6,
    p1Y - 14,
    8.5,
    fontRegular,
    black
  );

  // Insert continuation pages strictly BEFORE Annexure II (original page index 1+)
  let insertPageIndex = 1;
  const contTitleY = Math.min(layout.headerBannerBottomY - 18, 722);
  const contHeaderTop = contTitleY - 14;
  const contHeaderBottom = contHeaderTop - headerH;
  const contMaxFinalRowsH = contHeaderBottom - totalRowHeight - footerTotalH - page1MinY;
  const remainingHeightFrom = (startIdx) =>
    serviceRows.slice(startIdx).reduce((acc, r) => acc + r.rowHeight, 0);

  while (nextIdx < serviceRows.length && remainingHeightFrom(nextIdx) > contMaxFinalRowsH) {
    const [midPage] = await pdfDoc.copyPages(templateCopyDoc, [0]);
    pdfDoc.insertPage(insertPageIndex++, midPage);
    midPage.drawRectangle({
      x: 0,
      y: 0,
      width: layout.pageWidth,
      height: layout.headerBannerBottomY - 3,
      color: white,
    });
    midPage.drawText(`Annexure I (Continued) — QTN NO: ${qNum}`, {
      x: colX[0],
      y: contTitleY,
      size: 10,
      font: fontBold,
      color: black,
    });
    drawProposalTableHeader(midPage, contHeaderTop, contHeaderBottom);

    let my = contHeaderBottom;
    const startCount = nextIdx;
    while (nextIdx < reserveLimit) {
      const row = serviceRows[nextIdx];
      if (my - row.rowHeight < page1ContBottomY && nextIdx > startCount) break;
      my = drawProposalServiceRow(midPage, row, my);
      nextIdx++;
    }
    drawRightAlignedText(
      midPage,
      "Continued on next page...",
      colX[5] - 6,
      my - 14,
      8.5,
      fontRegular,
      black
    );
  }

  // Final Annexure I Continuation Page (holds remaining rows + TOTAL AMOUNT + Terms + Stamp)
  const [finalContPage] = await pdfDoc.copyPages(templateCopyDoc, [0]);
  pdfDoc.insertPage(insertPageIndex++, finalContPage);
  finalContPage.drawRectangle({
    x: 0,
    y: 0,
    width: layout.pageWidth,
    height: layout.headerBannerBottomY - 3,
    color: white,
  });
  finalContPage.drawText(`Annexure I (Continued) — QTN NO: ${qNum}`, {
    x: colX[0],
    y: contTitleY,
    size: 10,
    font: fontBold,
    color: black,
  });
  drawProposalTableHeader(finalContPage, contHeaderTop, contHeaderBottom);

  let fy = contHeaderBottom;
  while (nextIdx < serviceRows.length) {
    fy = drawProposalServiceRow(finalContPage, serviceRows[nextIdx], fy);
    nextIdx++;
  }
  drawTotalAndFooter(finalContPage, fy);

  return pdfDoc;
}

/**
 * Shared helper for replacing bank detail placeholders (`{bankName}`, `{accountNumber}`, `{ifsc}`)
 * in GST and Non-GST invoice templates while preserving static bank graphics, headings, and QR codes.
 */
function renderInvoiceBankPlaceholders(
  targetPage,
  layout,
  data,
  { fontRegular, fontBold },
  isTaxInvoice
) {
  if (!layout.bank.hasBankPlaceholders || layout.bank.preserveStaticBankImage) return;
  const bankPh = layout.bank.placeholders;
  if (!bankPh || bankPh.length === 0) return;

  const t = layout.table;
  const white = rgb(1, 1, 1);
  const xs = bankPh.map((p) => p.x);
  const ys = bankPh.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const qrBox = layout.bank.qrImageBox || null;
  const maxAllowedRightX = qrBox
    ? Math.min(qrBox.x0 - 4, t.amountSplitX - 20)
    : Math.min(minX + 340, t.amountSplitX - 20);
  const maskX = Math.max(t.leftX, minX - 3);
  const maskWidth = Math.max(40, maxAllowedRightX - maskX);

  const headingBottomCap =
    layout.bank.headingY != null ? layout.bank.headingY - 3 : maxY + 12;
  const maskTopY = Math.min(headingBottomCap, maxY + 12);
  const maskBottomY = minY - 4;

  targetPage.drawRectangle({
    x: maskX,
    y: maskBottomY,
    width: maskWidth,
    height: Math.max(12, maskTopY - maskBottomY),
    color: white,
  });

  const findPh = (names) => bankPh.find((p) => names.includes(p.token));
  const bPh = findPh(["bankName"]);
  const aPh = findPh(["accountNumber", "gstAccountNumber", "nonGstAccountNumber"]);
  const iPh = findPh(["ifsc", "ifscCode"]);

  const bankNameVal = sanitizePdfText(data.bankName || "HDFC BANK");
  const accNoVal = sanitizePdfText(
    isTaxInvoice
      ? data.gstAccountNumber || data.accountNumber || ""
      : data.nonGstAccountNumber || data.accountNumber || ""
  );
  const ifscVal = sanitizePdfText(data.ifsc || data.ifscCode || "");

  const drawBankEntry = (ph, label, val) => {
    if (!ph) return;
    const availW = maxAllowedRightX - ph.x;
    let fontSize = qrBox ? 8.5 : 9.0;
    const fullStr = `${label}${val}`;
    while (fontSize > 7.2 && fontBold.widthOfTextAtSize(fullStr, fontSize) > availW) {
      fontSize -= 0.4;
    }
    drawLabeledWrappedField(targetPage, {
      label,
      value: val,
      x: ph.x,
      y: ph.y,
      maxX: maxAllowedRightX,
      fontRegular,
      fontBold,
      fontSize,
      lineSpacing: fontSize + 2,
      labelGap: 2,
    });
  };

  drawBankEntry(bPh, "BANK NAME - ", bankNameVal);
  drawBankEntry(aPh, "A/C NO - ", accNoVal);
  drawBankEntry(iPh, "IFSC CODE - ", ifscVal);
}

/**
 * Measures intro copy and every treatment block (`PREMISES TREATED:` + `TYPE OF TREATMENT:`)
 * with hanging-indent alignment and zero truncation.
 */
function prepareInvoiceTreatmentBlocks(
  treatmentsList,
  data,
  bodyLabelX,
  bodyMaxX,
  fontRegular,
  fontBold,
  cellBounds = null
) {
  const introText =
    (typeof data?.particularsIntro === "string" && data.particularsIntro.trim()) ||
    (typeof data?.introText === "string" && data.introText.trim()) ||
    "Being Charges for pest management service rendered as details mentioned below.";
  const introX = bodyLabelX;
  const introMaxX = bodyMaxX;
  const introAvailableWidth = Math.max(50, introMaxX - introX);
  const introLines = wrapTextByFontMetrics(introText, introAvailableWidth, fontRegular, 9.2);
  const introLineSpacing = 12;
  const introHeight = introLines.length * introLineSpacing + 12;

  const FIELD_VERTICAL_GAP = 14;
  const BLOCK_VERTICAL_GAP = 12;

  const measuredTreatments = treatmentsList.map((item, idx) => {
    const pVal = item.premisesTreated || item.premises || data.premisesTreated || "";
    const tVal = item.treatmentType || item.serviceName || data.treatmentType || "";
    const prefix = treatmentsList.length > 1 ? `${idx + 1}. ` : "";
    const prefixIndent = prefix ? fontBold.widthOfTextAtSize(prefix, 9.5) : 0;
    const pLabel = `${prefix}PREMISES TREATED: `;
    const tLabel = "TYPE OF TREATMENT: ";
    const tX = bodyLabelX + prefixIndent;
    const pM = measureLabeledField(pLabel, pVal, bodyLabelX, bodyMaxX, fontBold, fontBold, 9.5, 12, 5);
    const tM = measureLabeledField(tLabel, tVal, tX, bodyMaxX, fontBold, fontBold, 9.5, 12, 5);
    return {
      idx,
      pX: bodyLabelX,
      tX,
      pLabel,
      pVal,
      tLabel,
      tVal,
      pHeight: pM.height,
      tHeight: tM.height,
      totalHeight: pM.height + FIELD_VERTICAL_GAP + tM.height + (idx < treatmentsList.length - 1 ? (12 + BLOCK_VERTICAL_GAP) : 6),
    };
  });

  const drawTreatmentBlock = (targetPage, blk, startY) => {
    const pRes = drawLabeledWrappedField(targetPage, {
      label: blk.pLabel,
      value: blk.pVal,
      x: blk.pX,
      y: startY,
      maxX: bodyMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: 9.5,
      lineSpacing: 12,
      labelGap: 5,
    });
    const tY = pRes.bottomY - (12 + FIELD_VERTICAL_GAP);
    const tRes = drawLabeledWrappedField(targetPage, {
      label: blk.tLabel,
      value: blk.tVal,
      x: blk.tX,
      y: tY,
      maxX: bodyMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: 9.5,
      lineSpacing: 12,
      labelGap: 5,
    });
    return tRes.bottomY - (12 + BLOCK_VERTICAL_GAP);
  };

  return {
    introX,
    introLines,
    introLineSpacing,
    introHeight,
    measuredTreatments,
    totalTreatmentsH: measuredTreatments.reduce((acc, b) => acc + b.totalHeight, 0),
    drawTreatmentBlock,
  };
}

/**
 * Shared single-page and multi-page invoice pagination engine for GST & Non-GST invoices.
 * Guarantees at least one treatment renders above Totals on the final page when overflowing.
 */
async function paginateInvoiceTreatments({
  pdfDoc,
  page1,
  templateBytes,
  layout,
  t,
  effPartHeaderBottomY,
  effBodyBottomY,
  bodyLabelX,
  treatmentPlan,
  subtotalStr,
  invoiceNumber,
  fontRegular,
  fontBold,
  borderW,
  renderCustomerAndMetaBlock,
  renderTotalsAndBank,
}) {
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);
  const { introX, introLines, introLineSpacing, introHeight, measuredTreatments, totalTreatmentsH, drawTreatmentBlock } =
    treatmentPlan;

  const page1AvailBodyH = effPartHeaderBottomY - effBodyBottomY - 14;

  if (introHeight + totalTreatmentsH <= page1AvailBodyH) {
    renderCustomerAndMetaBlock(page1);

    maskCellInterior(page1, t.leftX, effBodyBottomY, t.amountSplitX, effPartHeaderBottomY, white, 0.25);
    maskCellInterior(page1, t.amountSplitX, effBodyBottomY, t.rightX, effPartHeaderBottomY, white, 0.25);

    let cursorY = effPartHeaderBottomY - 18;
    for (const l of introLines) {
      if (l) {
        page1.drawText(l, { x: introX, y: cursorY, size: 9.2, font: fontRegular, color: black });
      }
      cursorY -= (introLineSpacing || 12);
    }
    cursorY -= 8;

    for (const blk of measuredTreatments) {
      cursorY = drawTreatmentBlock(page1, blk, cursorY);
    }

    const subY = Math.min(effPartHeaderBottomY - 26, Math.max(effBodyBottomY + 14, layout.fields.subtotalY));
    drawCenteredText(page1, `Rs. ${subtotalStr}`, t.amountSplitX, t.rightX, subY, 9.5, fontBold, black);

    drawHBorder(page1, t.leftX, t.rightX, effPartHeaderBottomY, borderW, black);
    drawVBorder(page1, t.leftX, effBodyBottomY, effPartHeaderBottomY, borderW, black);
    drawVBorder(page1, t.amountSplitX, effBodyBottomY, effPartHeaderBottomY, borderW, black);
    drawVBorder(page1, t.rightX, effBodyBottomY, effPartHeaderBottomY, borderW, black);

    renderTotalsAndBank(page1);
    return pdfDoc;
  }

  // Multi-page continuation path
  const cleanBytes = templateBytes || (await pdfDoc.save());
  const templateCopyDoc = await PDFDocument.load(cleanBytes);

  const page1ContBottomY = 62;
  renderCustomerAndMetaBlock(page1);
  page1.drawRectangle({
    x: 0,
    y: 0,
    width: layout.pageWidth,
    height: effPartHeaderBottomY - 0.2,
    color: white,
  });

  let p1Y = effPartHeaderBottomY - 18;
  for (const l of introLines) {
    if (l) page1.drawText(l, { x: introX, y: p1Y, size: 9.2, font: fontRegular, color: black });
    p1Y -= (introLineSpacing || 12);
  }
  p1Y -= 8;

  const reserveLimit = measuredTreatments.length > 1 ? measuredTreatments.length - 1 : 0;
  let nextIdx = 0;
  while (nextIdx < reserveLimit) {
    const blk = measuredTreatments[nextIdx];
    if (p1Y - blk.totalHeight < page1ContBottomY + 18 && nextIdx > 0) break;
    p1Y = drawTreatmentBlock(page1, blk, p1Y);
    nextIdx++;
  }

  page1.drawText("Continued on next page...", {
    x: t.amountSplitX - 115,
    y: page1ContBottomY + 6,
    size: 8.5,
    font: fontRegular,
    color: black,
  });
  drawHBorder(page1, t.leftX, t.rightX, effPartHeaderBottomY, borderW, black);
  drawVBorder(page1, t.leftX, page1ContBottomY, effPartHeaderBottomY, borderW, black);
  drawVBorder(page1, t.amountSplitX, page1ContBottomY, effPartHeaderBottomY, borderW, black);
  drawVBorder(page1, t.rightX, page1ContBottomY, effPartHeaderBottomY, borderW, black);
  drawHBorder(page1, t.leftX, t.rightX, page1ContBottomY, borderW, black);

  const contBarTopY = t.tableTopY;
  const contBodyTopY = contBarTopY - 24;
  const finalAvailBodyH = contBodyTopY - effBodyBottomY - 14;
  const remainingHeightFrom = (startIdx) =>
    measuredTreatments.slice(startIdx).reduce((acc, b) => acc + b.totalHeight, 0);

  while (nextIdx < measuredTreatments.length && remainingHeightFrom(nextIdx) > finalAvailBodyH) {
    const [midPage] = await pdfDoc.copyPages(templateCopyDoc, [0]);
    pdfDoc.addPage(midPage);
    midPage.drawRectangle({
      x: 0,
      y: 0,
      width: layout.pageWidth,
      height: contBarTopY - 0.5,
      color: white,
    });
    drawLabeledWrappedField(midPage, {
      label: "Particulars (Continued) - Invoice No: ",
      value: invoiceNumber || "",
      x: bodyLabelX,
      y: contBarTopY - 16,
      maxX: t.amountSplitX - 8,
      fontRegular: fontBold,
      fontBold,
      fontSize: 9.5,
      lineSpacing: 11,
    });
    drawCenteredText(midPage, "Amount", t.amountSplitX, t.rightX, contBarTopY - 16, 10, fontBold, black);

    let midY = contBodyTopY - 16;
    const startCount = nextIdx;
    while (nextIdx < reserveLimit) {
      const blk = measuredTreatments[nextIdx];
      if (midY - blk.totalHeight < page1ContBottomY + 18 && nextIdx > startCount) break;
      midY = drawTreatmentBlock(midPage, blk, midY);
      nextIdx++;
    }
    midPage.drawText("Continued on next page...", {
      x: t.amountSplitX - 115,
      y: page1ContBottomY + 6,
      size: 8.5,
      font: fontRegular,
      color: black,
    });
    drawHBorder(midPage, t.leftX, t.rightX, contBarTopY, borderW, black);
    drawHBorder(midPage, t.leftX, t.rightX, contBodyTopY, borderW, black);
    drawHBorder(midPage, t.leftX, t.rightX, page1ContBottomY, borderW, black);
    drawVBorder(midPage, t.leftX, page1ContBottomY, contBarTopY, borderW, black);
    drawVBorder(midPage, t.amountSplitX, page1ContBottomY, contBarTopY, borderW, black);
    drawVBorder(midPage, t.rightX, page1ContBottomY, contBarTopY, borderW, black);
  }

  // Final page: untouched cloned page 0 with footer totals/bank/QR/stamp intact
  const [finalPage] = await pdfDoc.copyPages(templateCopyDoc, [0]);
  pdfDoc.addPage(finalPage);
  maskCellInterior(finalPage, t.leftX, effBodyBottomY, t.rightX, contBarTopY, white, 0.5);

  drawLabeledWrappedField(finalPage, {
    label: "Particulars (Continued) - Invoice No: ",
    value: invoiceNumber || "",
    x: bodyLabelX,
    y: contBarTopY - 16,
    maxX: t.amountSplitX - 8,
    fontRegular: fontBold,
    fontBold,
    fontSize: 9.5,
    lineSpacing: 11,
  });
  drawCenteredText(finalPage, "Amount", t.amountSplitX, t.rightX, contBarTopY - 16, 10, fontBold, black);

  let finY = contBodyTopY - 16;
  while (nextIdx < measuredTreatments.length) {
    finY = drawTreatmentBlock(finalPage, measuredTreatments[nextIdx], finY);
    nextIdx++;
  }

  const finalSubY = Math.max(effBodyBottomY + 14, (contBodyTopY + effBodyBottomY) / 2);
  drawCenteredText(finalPage, `Rs. ${subtotalStr}`, t.amountSplitX, t.rightX, finalSubY, 9.5, fontBold, black);

  drawHBorder(finalPage, t.leftX, t.rightX, contBarTopY, borderW, black);
  drawHBorder(finalPage, t.leftX, t.rightX, contBodyTopY, borderW, black);
  drawVBorder(finalPage, t.leftX, effBodyBottomY, contBarTopY, borderW, black);
  drawVBorder(finalPage, t.amountSplitX, effBodyBottomY, contBarTopY, borderW, black);
  drawVBorder(finalPage, t.rightX, effBodyBottomY, contBarTopY, borderW, black);

  renderTotalsAndBank(finalPage);
  return pdfDoc;
}

// ============================================================
// 2. GST TAX INVOICE PDF GENERATOR (`tax-invoice`)
// ============================================================

export async function generateTaxInvoicePdf(
  pdfDoc,
  data,
  inspection = null,
  templateBytes = null
) {
  const pages = pdfDoc.getPages();
  if (pages.length === 0) throw new PdfTemplateValidationError("PDF template has no pages");

  const resolvedInspection =
    inspection ||
    (templateBytes
      ? await inspectPdfTemplate(templateBytes)
      : await inspectPdfTemplate(await pdfDoc.save()));

  const layout = resolveTaxInvoicePdfLayout(resolvedInspection);
  const fonts = await selectDocumentFonts(pdfDoc, layout.fontFamily);
  const fontRegular = fonts.regular;
  const fontBold = fonts.bold;
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);

  const t = layout.table;
  const borderW = Math.max(1.2, t.leftThickness || 1.4);
  const padX = 6;
  const custPadX = 16;

  // Normalize CRM payload (exact same fields passed to DOCX)
  const cName = sanitizePdfText(
    data.customerName || data.customerCompanyName || data.customerFullName || ""
  );
  const cAddr = sanitizePdfText(data.customerAddress || "");
  const gstNo = sanitizePdfText(data.gstNumber || data.gstin || data.GSTIN || "");
  const gstCode = sanitizePdfText(data.gstCode || "27");

  const hsnCode = sanitizePdfText(data.hsnCode || "");
  const sacCode = sanitizePdfText(data.sacCode || "");

  const treatmentsList =
    Array.isArray(data.treatments) && data.treatments.length > 0
      ? data.treatments
      : [
          {
            premisesTreated: data.premisesTreated || data.customerAddress || "",
            treatmentType: data.treatmentType || "General Pest Management Treatment",
          },
        ];

  const isIgst = Boolean(data.isIgst || Number(data.igstPercentage) > 0);
  const igstPct = sanitizePdfText(data.igstPercentage ?? (isIgst ? "18" : "0"));
  const igstAmt = sanitizePdfText(data.igstAmount || "0.00");
  const cgstPct = sanitizePdfText(data.cgstPercentage ?? (isIgst ? "0" : "9"));
  const cgstAmt = sanitizePdfText(data.cgstAmount || "0.00");
  const sgstPct = sanitizePdfText(data.sgstPercentage ?? (isIgst ? "0" : "9"));
  const sgstAmt = sanitizePdfText(data.sgstAmount || "0.00");
  const subtotalStr = sanitizePdfText(data.subtotal || "0.00");
  const totalAmountStr = sanitizePdfText(data.totalAmount || "0.00");
  const amountInWords = sanitizePdfText(data.amountInWords || data.amountWords || "");

  const page1 = pages[0];

  // ------------------------------------------------------------
  // Measure Left & Right Customer/Metadata Header Block Height
  // ------------------------------------------------------------
  const leftTextX = t.leftX + custPadX;
  const leftMaxX = t.metaSplitX - 8;
  const custWidth = Math.max(80, leftMaxX - leftTextX);
  const cNameLines = cName ? wrapTextByFontMetrics(cName, custWidth, fontBold, 9.5) : [];
  const cAddrLines = cAddr ? wrapTextByFontMetrics(cAddr, custWidth, fontRegular, 8.8) : [];

  const leftGstLineH = gstNo ? 18 : 6;
  const leftContentH =
    18 + // TO,
    cNameLines.length * 11 +
    (cAddrLines.length > 0 ? 2 + cAddrLines.length * 10.5 : 0) +
    leftGstLineH +
    6;

  // Right metadata sub-blocks
  const rightLabelX = t.metaSplitX + 6;
  const rightMaxX = t.rightX - 6;

  const metaFontSize = 8.4;
  const metaLineSpacing = 10;
  const invNoM = measureLabeledField("Invoice No : ", data.invoiceNumber || "", rightLabelX, rightMaxX, fontBold, fontBold, metaFontSize, metaLineSpacing, 3);
  const invDateM = measureLabeledField("Invoice Date : ", data.invoiceDate || "", rightLabelX, rightMaxX, fontBold, fontBold, metaFontSize, metaLineSpacing, 3);
  const billPeriodM = measureLabeledField("BILLING PERIOD : ", data.billingPeriod || "", rightLabelX, rightMaxX, fontRegular, fontBold, 8.2, 9.8, 3, null, true);

  const topMetaContentH = invNoM.height + 2 + invDateM.height + 2 + billPeriodM.height + 8;

  const woNoM = measureLabeledField("WORK ORDER NO : ", data.workOrderNumber || "N/A", rightLabelX, rightMaxX, fontRegular, fontBold, 8.2, 9.8, 3);
  const woDateM = measureLabeledField("WORK ORDER DATE : ", data.workOrderDate || "", rightLabelX, rightMaxX, fontRegular, fontBold, 8.2, 9.8, 3);
  const woContentH = woNoM.height + 2 + woDateM.height + 6;

  const origHsnH =
    t.hsnTopY && t.hsnBottomY
      ? t.hsnTopY - t.hsnBottomY
      : 22;
  const origHeaderH = t.tableTopY - t.particularsHeaderTopY;
  const origTopMetaH = t.hsnTopY ? t.tableTopY - t.hsnTopY : 60;
  const origWoH = t.hsnBottomY ? t.hsnBottomY - t.particularsHeaderTopY : 34;

  const neededRightHeaderH =
    Math.max(origTopMetaH, topMetaContentH) +
    origHsnH +
    Math.max(origWoH, woContentH);

  const headerShift = Math.max(
    0,
    leftContentH - origHeaderH,
    neededRightHeaderH - origHeaderH
  );

  const effPartHeaderTopY = t.particularsHeaderTopY - headerShift;
  const effPartHeaderH = t.particularsHeaderTopY - t.particularsHeaderBottomY;
  const effPartHeaderBottomY = effPartHeaderTopY - effPartHeaderH;
  const effHsnTopY = t.hsnTopY
    ? Math.min(t.tableTopY - Math.max(origTopMetaH, topMetaContentH), t.hsnTopY)
    : null;
  const effHsnBottomY = effHsnTopY ? effHsnTopY - origHsnH : null;

  // Helper to draw customer & metadata header on page 1 cleanly
  const renderCustomerAndMetaBlock = (targetPage) => {
    // Mask entire header interior (or expanded zone down to effPartHeaderBottomY)
    if (headerShift > 0) {
      maskCellInterior(
        targetPage,
        t.leftX,
        effPartHeaderBottomY,
        t.rightX,
        t.tableTopY,
        white,
        1.0
      );
    } else {
      maskCellInterior(targetPage, t.leftX, effPartHeaderTopY, t.metaSplitX, t.tableTopY, white, 1.5);
      if (effHsnTopY && effHsnBottomY) {
        maskCellInterior(targetPage, t.metaSplitX, effHsnTopY, t.rightX, t.tableTopY, white, 1.5);
        if (t.hsnSacSplitX) {
          maskCellInterior(targetPage, t.metaSplitX, effHsnBottomY, t.hsnSacSplitX, effHsnTopY, white, 1.5);
          maskCellInterior(targetPage, t.hsnSacSplitX, effHsnBottomY, t.rightX, effHsnTopY, white, 1.5);
        } else {
          maskCellInterior(targetPage, t.metaSplitX, effHsnBottomY, t.rightX, effHsnTopY, white, 1.5);
        }
        maskCellInterior(targetPage, t.metaSplitX, effPartHeaderTopY, t.rightX, effHsnBottomY, white, 1.5);
      } else {
        maskCellInterior(targetPage, t.metaSplitX, effPartHeaderTopY, t.rightX, t.tableTopY, white, 1.5);
      }
    }

    // Left Box Content: TO, Customer Name, Address (no line truncation), GST NO + CODE
    let cy = t.tableTopY - 14;
    targetPage.drawText("TO,", {
      x: t.leftX + 8,
      y: cy,
      size: 9.5,
      font: fontBold,
      color: black,
    });
    cy -= 13;

    for (const line of cNameLines) {
      if (line) {
        targetPage.drawText(line, { x: leftTextX, y: cy, size: 9.5, font: fontBold, color: black });
      }
      cy -= 11;
    }

    if (cAddrLines.length > 0) {
      cy -= 2;
      for (const line of cAddrLines) {
        if (line) {
          targetPage.drawText(line, { x: leftTextX, y: cy, size: 8.8, font: fontRegular, color: black });
        }
        cy -= 10.5;
      }
    }

    if (gstNo) {
      const gstY = Math.min(cy - 6, effPartHeaderTopY + 8);
      targetPage.drawText(`GST NO. :- `, {
        x: t.leftX + 16,
        y: gstY,
        size: 9.0,
        font: fontBold,
        color: black,
      });
      const gstPrefixW = fontBold.widthOfTextAtSize("GST NO. :- ", 9.0);
      targetPage.drawText(gstNo, {
        x: t.leftX + 16 + gstPrefixW,
        y: gstY,
        size: 9.0,
        font: fontRegular,
        color: black,
      });
      const codeStr = `${layout.fields.stateCodeLabel} - ${gstCode}`;
      drawRightAlignedText(targetPage, codeStr, t.metaSplitX - 10, gstY, 8.8, fontBold, black);
    }

    // Right Box Sub-cell 1: Invoice No, Invoice Date, Billing Period
    let ry = t.tableTopY - 14;
    const invNoRes = drawLabeledWrappedField(targetPage, {
      label: "Invoice No : ",
      value: data.invoiceNumber || "",
      x: rightLabelX,
      y: ry,
      maxX: rightMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: metaFontSize,
      lineSpacing: metaLineSpacing,
      labelGap: 3,
    });
    ry = invNoRes.bottomY - 13;

    const invDateRes = drawLabeledWrappedField(targetPage, {
      label: "Invoice Date : ",
      value: data.invoiceDate || "",
      x: rightLabelX,
      y: ry,
      maxX: rightMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: metaFontSize,
      lineSpacing: metaLineSpacing,
      labelGap: 3,
    });
    ry = invDateRes.bottomY - 13;

    drawLabeledWrappedField(targetPage, {
      label: "BILLING PERIOD : ",
      value: data.billingPeriod || "",
      x: rightLabelX,
      y: ry,
      maxX: rightMaxX,
      fontRegular,
      fontBold,
      fontSize: 8.2,
      lineSpacing: 9.8,
      labelGap: 3,
      breakBeforeValueIfOverflow: true,
    });

    // Right Box Sub-cell 2: HSN | SAC
    if (effHsnTopY && effHsnBottomY) {
      const hsnMidY = effHsnBottomY + (effHsnTopY - effHsnBottomY - 8.5) / 2 + 1;
      if (t.hsnSacSplitX) {
        drawLabeledWrappedField(targetPage, {
          label: "HSN - ",
          value: hsnCode,
          x: rightLabelX,
          y: hsnMidY,
          maxX: t.hsnSacSplitX - 4,
          fontRegular,
          fontBold,
          fontSize: 8.5,
          lineSpacing: 10,
          labelGap: 2,
        });
        drawLabeledWrappedField(targetPage, {
          label: "SAC CODE - ",
          value: sacCode,
          x: t.hsnSacSplitX + 6,
          y: hsnMidY,
          maxX: rightMaxX,
          fontRegular,
          fontBold,
          fontSize: 8.5,
          lineSpacing: 10,
          labelGap: 2,
        });
      } else {
        drawLabeledWrappedField(targetPage, {
          label: "HSN / SAC : ",
          value: `${hsnCode}${sacCode ? ` / ${sacCode}` : ""}`,
          x: rightLabelX,
          y: hsnMidY,
          maxX: rightMaxX,
          fontRegular,
          fontBold,
          fontSize: 8.5,
          lineSpacing: 10,
          labelGap: 2,
        });
      }
    }

    // Right Box Sub-cell 3: Work Order No & Date
    const woTopAnchor = (effHsnBottomY || effPartHeaderTopY + 34) - 12;
    const woRes = drawLabeledWrappedField(targetPage, {
      label: "WORK ORDER NO : ",
      value: data.workOrderNumber || "N/A",
      x: rightLabelX,
      y: woTopAnchor,
      maxX: rightMaxX,
      fontRegular,
      fontBold,
      fontSize: 8.2,
      lineSpacing: 9.8,
      labelGap: 3,
    });
    drawLabeledWrappedField(targetPage, {
      label: "WORK ORDER DATE : ",
      value: data.workOrderDate || "",
      x: rightLabelX,
      y: woRes.bottomY - 12,
      maxX: rightMaxX,
      fontRegular,
      fontBold,
      fontSize: 8.2,
      lineSpacing: 9.8,
      labelGap: 3,
    });

    // If customer/meta block expanded, redraw Particulars | Amount header bar & internal header borders
    if (headerShift > 0) {
      drawCenteredText(
        targetPage,
        "Particulars",
        t.leftX,
        t.amountSplitX,
        effPartHeaderBottomY + (effPartHeaderH - 10) / 2 + 1,
        10.5,
        fontBold,
        black
      );
      drawCenteredText(
        targetPage,
        "Amount",
        t.amountSplitX,
        t.rightX,
        effPartHeaderBottomY + (effPartHeaderH - 10) / 2 + 1,
        10.5,
        fontBold,
        black
      );
    }

    // Always restore crisp borders for the header section
    drawHBorder(targetPage, t.leftX, t.rightX, t.tableTopY, borderW, black);
    if (effHsnTopY && effHsnBottomY) {
      drawHBorder(targetPage, t.metaSplitX, t.rightX, effHsnTopY, borderW, black);
      drawHBorder(targetPage, t.metaSplitX, t.rightX, effHsnBottomY, borderW, black);
      if (t.hsnSacSplitX) {
        drawVBorder(targetPage, t.hsnSacSplitX, effHsnBottomY, effHsnTopY, borderW, black);
      }
    }
    drawHBorder(targetPage, t.leftX, t.rightX, effPartHeaderTopY, borderW, black);
    drawHBorder(targetPage, t.leftX, t.rightX, effPartHeaderBottomY, borderW, black);
    drawVBorder(targetPage, t.leftX, effPartHeaderBottomY, t.tableTopY, borderW, black);
    drawVBorder(targetPage, t.metaSplitX, effPartHeaderTopY, t.tableTopY, borderW, black);
    drawVBorder(targetPage, t.amountSplitX, effPartHeaderBottomY, effPartHeaderTopY, borderW, black);
    drawVBorder(targetPage, t.rightX, effPartHeaderBottomY, t.tableTopY, borderW, black);
  };

  // ------------------------------------------------------------
  // Prepare Tax & Total Row Heights (shift Tax rows up if AMOUNT IN WORDS wraps >= 2 lines)
  // ------------------------------------------------------------
  const wordsMaxX = t.amountSplitX - 6;
  let wordsFontSize = 8.8;
  let wordsSpacing = 10.5;
  let wordsM = measureLabeledField(
    "AMOUNT IN WORDS:- ",
    amountInWords,
    t.leftX + 5,
    wordsMaxX,
    fontBold,
    fontBold,
    wordsFontSize,
    wordsSpacing,
    4
  );
  if (wordsM.lineCount > 1) {
    wordsFontSize = 7.8;
    wordsSpacing = 9.2;
    wordsM = measureLabeledField(
      "AMOUNT IN WORDS:- ",
      amountInWords,
      t.leftX + 5,
      wordsMaxX,
      fontBold,
      fontBold,
      wordsFontSize,
      wordsSpacing,
      4
    );
  }
  const origTotalRowH = t.totalRow.topY - t.totalRow.bottomY;
  const neededTotalRowH = Math.max(origTotalRowH, wordsM.height + 9);
  const taxShiftUp = Math.max(0, neededTotalRowH - origTotalRowH);

  const effTotalBottomY = t.totalRow.bottomY;
  const effTotalTopY = t.totalRow.topY + taxShiftUp;
  const sgstH = t.sgstRow.topY - t.sgstRow.bottomY;
  const cgstH = t.cgstRow.topY - t.cgstRow.bottomY;
  const igstH = t.igstRow.topY - t.igstRow.bottomY;
  const effSgstTopY = effTotalTopY + sgstH;
  const effCgstTopY = effSgstTopY + cgstH;
  const effIgstTopY = effCgstTopY + igstH;
  const effBodyBottomY = effIgstTopY;

  // Helper to render IGST/CGST/SGST + Amount in Words + Total + Bank Details on the bottom page
  const renderTotalsAndBank = (targetPage) => {
    const rowMidY = (topY, botY, fs) => botY + (topY - botY - fs) / 2 + 1.5;

    // Mask and draw the 3 tax rows & Total row cleanly inside borders.
    // When `taxShiftUp > 0`, also cover the shifted original horizontal rules between outer borders cleanly.
    if (taxShiftUp > 0) {
      maskCellInterior(targetPage, t.leftX, effTotalBottomY, t.rightX, effIgstTopY + 1, white, 0.2);
    } else {
      maskCellInterior(targetPage, t.leftX, effTotalBottomY, t.amountSplitX, effIgstTopY, white, 1.5);
      maskCellInterior(targetPage, t.amountSplitX, effTotalBottomY, t.rightX, effIgstTopY, white, 1.5);
    }

    const taxRightLabelX = t.amountSplitX - 45;
    const drawTaxRow = (topY, botY, labelText, amountText) => {
      const midY = rowMidY(topY, botY, 9.0);
      drawRightAlignedText(targetPage, labelText, taxRightLabelX, midY, 9.0, fontBold, black);
      drawCenteredText(
        targetPage,
        `Rs. ${amountText}`,
        t.amountSplitX,
        t.rightX,
        midY,
        9.0,
        fontRegular,
        black
      );
    };

    drawTaxRow(effIgstTopY, effCgstTopY, `ADD IGST (${igstPct}%)`, igstAmt);
    drawTaxRow(effCgstTopY, effSgstTopY, `ADD CGST (${cgstPct}%)`, cgstAmt);
    drawTaxRow(effSgstTopY, effTotalTopY, `ADD SGST (${sgstPct}%)`, sgstAmt);

    // Amount in Words + Total row (centered vertically inside expanded/original box)
    const wordsBlockTopPad = Math.max(3, (effTotalTopY - effTotalBottomY - ((wordsM.lineCount - 1) * wordsSpacing + wordsFontSize)) / 2);
    const wordsTopBaseline = effTotalTopY - wordsBlockTopPad - wordsFontSize + 1.5;
    drawLabeledWrappedField(targetPage, {
      label: "AMOUNT IN WORDS:- ",
      value: amountInWords,
      x: t.leftX + 5,
      y: wordsTopBaseline,
      maxX: wordsMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: wordsFontSize,
      lineSpacing: wordsSpacing,
      labelGap: 4,
    });
    drawCenteredText(
      targetPage,
      `Rs. ${totalAmountStr}`,
      t.amountSplitX,
      t.rightX,
      rowMidY(effTotalTopY, effTotalBottomY, 9.5),
      9.5,
      fontBold,
      black
    );

    // Redraw horizontal & vertical borders for tax & total rows
    drawHBorder(targetPage, t.leftX, t.rightX, effIgstTopY, borderW, black);
    drawHBorder(targetPage, t.leftX, t.rightX, effCgstTopY, borderW, black);
    drawHBorder(targetPage, t.leftX, t.rightX, effSgstTopY, borderW, black);
    drawHBorder(targetPage, t.leftX, t.rightX, effTotalTopY, borderW, black);
    drawHBorder(targetPage, t.leftX, t.rightX, effTotalBottomY, borderW, black);
    drawVBorder(targetPage, t.leftX, effTotalBottomY, effIgstTopY, borderW, black);
    drawVBorder(targetPage, t.amountSplitX, effTotalBottomY, effIgstTopY, borderW, black);
    drawVBorder(targetPage, t.rightX, effTotalBottomY, effIgstTopY, borderW, black);

    // Bank details: ONLY replace text tokens when the uploaded template uses text placeholders;
    // preserve static raster bank graphics (e.g. `FORMAT - TAX BILL SINGLE PAGE.pdf`).
    renderInvoiceBankPlaceholders(targetPage, layout, data, { fontRegular, fontBold }, true);
  };

  // ------------------------------------------------------------
  // Measure All Treatment Blocks (zero `.slice()` truncation!)
  // ------------------------------------------------------------
  const bodyLabelX = t.leftX + padX;
  const bodyMaxX = t.amountSplitX - 8;
  const treatmentPlan = prepareInvoiceTreatmentBlocks(
    treatmentsList,
    data,
    bodyLabelX,
    bodyMaxX,
    fontRegular,
    fontBold,
    { leftX: t.leftX, rightX: t.amountSplitX }
  );

  return paginateInvoiceTreatments({
    pdfDoc,
    page1,
    templateBytes,
    layout,
    t,
    effPartHeaderBottomY,
    effBodyBottomY,
    bodyLabelX,
    treatmentPlan,
    subtotalStr,
    invoiceNumber: data.invoiceNumber || "",
    fontRegular,
    fontBold,
    borderW,
    renderCustomerAndMetaBlock,
    renderTotalsAndBank,
  });
}

// ============================================================
// 3. NON-GST INVOICE PDF GENERATOR (`invoice`)
// ============================================================

export async function generateNonGstInvoicePdf(
  pdfDoc,
  data,
  inspection = null,
  templateBytes = null
) {
  const pages = pdfDoc.getPages();
  if (pages.length === 0) throw new PdfTemplateValidationError("PDF template has no pages");

  const resolvedInspection =
    inspection ||
    (templateBytes
      ? await inspectPdfTemplate(templateBytes)
      : await inspectPdfTemplate(await pdfDoc.save()));
  const layout = resolveNonGstInvoicePdfLayout(resolvedInspection);
  const page1 = pages[0];

  const { regular: fontRegular, bold: fontBold } = await selectDocumentFonts(
    pdfDoc,
    layout.fontFamily
  );
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);

  const t = layout.table;
  const borderW = Math.max(1.2, t.leftThickness || 1.4);
  const padX = 6;

  // ------------------------------------------------------------
  // Measure Customer (Left) & Metadata Sub-Cells (Right)
  // ------------------------------------------------------------
  const cName = sanitizePdfText(
    data.customerName || data.customerCompanyName || data.customerFullName || ""
  );
  const cAddr = sanitizePdfText(data.customerAddress || "");
  const toX = layout.fields.toX;
  const custX = layout.fields.custIndentX;
  const custMaxX = t.metaSplitX - 8;

  const cNameLines = cName ? wrapTextByFontMetrics(cName, custMaxX - custX, fontBold, 9.5) : [];
  const cAddrLines = cAddr ? wrapTextByFontMetrics(cAddr, custMaxX - custX, fontRegular, 8.8) : [];
  const leftNeededH =
    10 + 14 + cNameLines.length * 11.5 + 3 + (cAddrLines.length > 0 ? cAddrLines.length * 11 + 6 : 4);

  const metaX = t.metaSplitX + 5;
  const metaMaxX = t.rightX - 6;
  const metaFontSize = 8.6;
  const metaLineSpacing = 10.5;

  const invNoVal = sanitizePdfText(data.invoiceNumber || "");
  const invDateVal = sanitizePdfText(data.invoiceDate || "");
  const billVal = sanitizePdfText(data.billingPeriod || "");
  const contractVal = sanitizePdfText(data.contractPeriod || "");

  const invNoM = measureLabeledField(
    "Invoice No : ",
    invNoVal,
    metaX,
    metaMaxX,
    fontRegular,
    fontBold,
    metaFontSize,
    metaLineSpacing,
    3.5
  );
  const invDateM = measureLabeledField(
    "Invoice Date : ",
    invDateVal,
    metaX,
    metaMaxX,
    fontRegular,
    fontBold,
    metaFontSize,
    metaLineSpacing,
    3.5
  );
  const billM = measureLabeledField(
    "BILLING PERIOD : ",
    billVal,
    metaX,
    metaMaxX,
    fontRegular,
    fontBold,
    8.3,
    metaLineSpacing,
    3.5,
    null,
    true
  );
  const contractM = measureLabeledField(
    "Contract Period : ",
    contractVal,
    metaX,
    metaMaxX,
    fontRegular,
    fontBold,
    8.3,
    metaLineSpacing,
    3.5,
    null,
    true
  );

  const div1Orig = t.metaRightDividers[0] || { y: t.tableTopY - 47, thickness: 0.75 };
  const div2Orig = t.metaRightDividers[1] || { y: div1Orig.y - 26.5, thickness: borderW };
  const row1OrigH = t.tableTopY - div1Orig.y;
  const row2OrigH = div1Orig.y - div2Orig.y;
  const row3OrigH = div2Orig.y - t.particularsHeaderTopY;

  const row1H = Math.max(row1OrigH, 8 + invNoM.height + 5 + invDateM.height + 5);
  const row2H = Math.max(row2OrigH, 7 + billM.height + 5);
  let row3H = Math.max(row3OrigH, 7 + contractM.height + 5);

  const origMetaH = t.tableTopY - t.particularsHeaderTopY;
  const actualMetaH = Math.max(origMetaH, leftNeededH, row1H + row2H + row3H);
  if (actualMetaH > row1H + row2H + row3H) {
    row3H += actualMetaH - (row1H + row2H + row3H);
  }

  const effDiv1Y = t.tableTopY - row1H;
  const effDiv2Y = effDiv1Y - row2H;
  const effPartHeaderTopY = t.tableTopY - actualMetaH;
  const partBarH = t.particularsHeaderTopY - t.particularsHeaderBottomY;
  const effPartHeaderBottomY = effPartHeaderTopY - partBarH;
  const headerShifted = Math.abs(effPartHeaderTopY - t.particularsHeaderTopY) > 0.8;

  // ------------------------------------------------------------
  // Measure Amount In Words Row (expands UPWARD if wrapped)
  // ------------------------------------------------------------
  const amountInWords = sanitizePdfText(data.amountInWords || data.amountWords || "");
  const subtotalStr = sanitizePdfText(data.subtotal || data.totalAmount || "0.00");
  const totalAmountStr = sanitizePdfText(data.totalAmount || "0.00");

  const wordsFontSize = 8.6;
  const wordsLeading = 10.5;
  const wordsM = measureLabeledField(
    "AMOUNT IN WORDS:- ",
    amountInWords,
    t.leftX + 5,
    t.amountSplitX - 8,
    fontBold,
    fontBold,
    wordsFontSize,
    wordsLeading,
    4
  );

  const origTotalH = t.totalRow.topY - t.totalRow.bottomY;
  const actualTotalH = Math.max(origTotalH, wordsM.height + 12);
  const effTotalBottomY = t.totalRow.bottomY;
  const effTotalTopY = effTotalBottomY + actualTotalH;
  const effBodyBottomY = effTotalTopY;

  const treatmentsList =
    Array.isArray(data.treatments) && data.treatments.length > 0
      ? data.treatments
      : [
          {
            premisesTreated: data.premisesTreated || data.customerAddress || "",
            treatmentType: data.treatmentType || "General Pest Management Treatment",
          },
        ];

  const renderCustomerAndMetaBlock = (targetPage) => {
    if (headerShifted) {
      maskCellInterior(targetPage, t.leftX, effPartHeaderBottomY, t.rightX, t.tableTopY, white, 0.25);
      drawCenteredText(
        targetPage,
        "Particulars",
        t.leftX,
        t.amountSplitX,
        effPartHeaderBottomY + partBarH / 2 - 3.5,
        10,
        fontBold,
        black
      );
      drawCenteredText(
        targetPage,
        "Amount",
        t.amountSplitX,
        t.rightX,
        effPartHeaderBottomY + partBarH / 2 - 3.5,
        10,
        fontBold,
        black
      );
      drawHBorder(targetPage, t.leftX, t.rightX, effPartHeaderTopY, borderW, black);
      drawHBorder(targetPage, t.leftX, t.rightX, effPartHeaderBottomY, borderW, black);
      drawVBorder(targetPage, t.amountSplitX, effPartHeaderBottomY, effPartHeaderTopY, borderW, black);
    } else {
      maskCellInterior(targetPage, t.leftX, effPartHeaderTopY, t.metaSplitX, t.tableTopY, white, 1.5);
      maskCellInterior(targetPage, t.metaSplitX, effPartHeaderTopY, t.rightX, t.tableTopY, white, 1.5);
    }

    drawHBorder(targetPage, t.leftX, t.rightX, t.tableTopY, borderW, black);
    drawHBorder(targetPage, t.metaSplitX, t.rightX, effDiv1Y, div1Orig.thickness || 0.75, black);
    drawHBorder(targetPage, t.metaSplitX, t.rightX, effDiv2Y, div2Orig.thickness || borderW, black);
    drawVBorder(targetPage, t.leftX, effPartHeaderBottomY, t.tableTopY, borderW, black);
    drawVBorder(targetPage, t.metaSplitX, effPartHeaderTopY, t.tableTopY, borderW, black);
    drawVBorder(targetPage, t.rightX, effPartHeaderBottomY, t.tableTopY, borderW, black);

    // Left Box: TO, Customer Name & Full Wrapped Address (NO truncation!)
    let ly = t.tableTopY - 14;
    targetPage.drawText("TO,", { x: toX, y: ly, size: 9.5, font: fontBold, color: black });
    ly -= 14;

    for (const l of cNameLines) {
      if (l) {
        targetPage.drawText(l, { x: custX, y: ly, size: 9.5, font: fontBold, color: black });
      }
      ly -= 11.5;
    }
    ly -= 2;

    for (const l of cAddrLines) {
      if (l) {
        targetPage.drawText(l, { x: custX, y: ly, size: 8.8, font: fontRegular, color: black });
      }
      ly -= 11;
    }

    // Right Metadata Sub-Cell 1: Invoice No + Invoice Date
    let ry = t.tableTopY - 13;
    const invNoRes = drawLabeledWrappedField(targetPage, {
      label: "Invoice No : ",
      value: invNoVal,
      x: metaX,
      y: ry,
      maxX: metaMaxX,
      fontRegular,
      fontBold,
      fontSize: metaFontSize,
      lineSpacing: metaLineSpacing,
      labelGap: 3.5,
    });
    ry = invNoRes.bottomY - 13;
    drawLabeledWrappedField(targetPage, {
      label: "Invoice Date : ",
      value: invDateVal,
      x: metaX,
      y: ry,
      maxX: metaMaxX,
      fontRegular,
      fontBold,
      fontSize: metaFontSize,
      lineSpacing: metaLineSpacing,
      labelGap: 3.5,
    });

    // Right Metadata Sub-Cell 2: BILLING PERIOD (vertically balanced inside box)
    const billTopY = effDiv1Y - Math.max(11, (row2H - billM.height) / 2 + 6);
    drawLabeledWrappedField(targetPage, {
      label: "BILLING PERIOD : ",
      value: billVal,
      x: metaX,
      y: billTopY,
      maxX: metaMaxX,
      fontRegular,
      fontBold,
      fontSize: 8.3,
      lineSpacing: metaLineSpacing,
      labelGap: 3.5,
      breakBeforeValueIfOverflow: true,
    });

    // Right Metadata Sub-Cell 3: Contract Period
    const contractTopY = effDiv2Y - Math.max(11, (row3H - contractM.height) / 2 + 6);
    drawLabeledWrappedField(targetPage, {
      label: "Contract Period : ",
      value: contractVal,
      x: metaX,
      y: contractTopY,
      maxX: metaMaxX,
      fontRegular,
      fontBold,
      fontSize: 8.3,
      lineSpacing: metaLineSpacing,
      labelGap: 3.5,
      breakBeforeValueIfOverflow: true,
    });
  };

  const renderTotalsAndBank = (targetPage) => {
    maskCellInterior(targetPage, t.leftX, effTotalBottomY, t.amountSplitX, effTotalTopY, white, 0.25);
    maskCellInterior(targetPage, t.amountSplitX, effTotalBottomY, t.rightX, effTotalTopY, white, 0.25);

    const wordsStartY = effTotalTopY - Math.max(11.5, (actualTotalH - wordsM.height) / 2 + 6.5);
    drawLabeledWrappedField(targetPage, {
      label: "AMOUNT IN WORDS:- ",
      value: amountInWords,
      x: t.leftX + 5,
      y: wordsStartY,
      maxX: t.amountSplitX - 8,
      fontRegular: fontBold,
      fontBold,
      fontSize: wordsFontSize,
      lineSpacing: wordsLeading,
      labelGap: 4,
    });

    const totalAmtY = (effTotalBottomY + effTotalTopY) / 2 - 3.2;
    drawCenteredText(
      targetPage,
      `Rs. ${totalAmountStr}`,
      t.amountSplitX,
      t.rightX,
      totalAmtY,
      9.5,
      fontBold,
      black
    );

    drawHBorder(targetPage, t.leftX, t.rightX, effTotalTopY, borderW, black);
    drawHBorder(targetPage, t.leftX, t.rightX, effTotalBottomY, borderW, black);
    drawVBorder(targetPage, t.leftX, effTotalBottomY, effTotalTopY, borderW, black);
    drawVBorder(targetPage, t.amountSplitX, effTotalBottomY, effTotalTopY, borderW, black);
    drawVBorder(targetPage, t.rightX, effTotalBottomY, effTotalTopY, borderW, black);

    // Replace bank placeholders while strictly preserving BANK DETAILS heading, GPAY QR, & Stamp
    renderInvoiceBankPlaceholders(targetPage, layout, data, { fontRegular, fontBold }, false);
  };

  const bodyLabelX = t.leftX + padX;
  const bodyMaxX = t.amountSplitX - 8;
  const treatmentPlan = prepareInvoiceTreatmentBlocks(
    treatmentsList,
    data,
    bodyLabelX,
    bodyMaxX,
    fontRegular,
    fontBold,
    { leftX: t.leftX, rightX: t.amountSplitX }
  );

  return paginateInvoiceTreatments({
    pdfDoc,
    page1,
    templateBytes,
    layout,
    t,
    effPartHeaderBottomY,
    effBodyBottomY,
    bodyLabelX,
    treatmentPlan,
    subtotalStr,
    invoiceNumber: invNoVal,
    fontRegular,
    fontBold,
    borderW,
    renderCustomerAndMetaBlock,
    renderTotalsAndBank,
  });
}

// ============================================================
// 4. CONTRACT RENEWAL PDF GENERATOR (`contract-renewal`)
// ============================================================

export async function generateContractRenewalPdf(
  pdfDoc,
  data,
  inspection = null,
  templateBytes = null
) {
  const pages = pdfDoc.getPages();
  if (pages.length === 0) throw new PdfTemplateValidationError("PDF template has no pages");

  const resolvedInspection =
    inspection ||
    (templateBytes
      ? await inspectPdfTemplate(templateBytes)
      : await inspectPdfTemplate(await pdfDoc.save()));
  const layout = resolveContractRenewalPdfLayout(resolvedInspection);
  const page1 = pages[0];

  const { regular: fontRegular, bold: fontBold } = await selectDocumentFonts(
    pdfDoc,
    layout.fontFamily
  );

  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);
  const headerBg = rgb(
    layout.colors.headerFillRgb[0],
    layout.colors.headerFillRgb[1],
    layout.colors.headerFillRgb[2]
  );
  const rowBg = rgb(
    layout.colors.rowFillRgb[0],
    layout.colors.rowFillRgb[1],
    layout.colors.rowFillRgb[2]
  );
  const totalBg = rgb(
    layout.colors.totalFillRgb[0],
    layout.colors.totalFillRgb[1],
    layout.colors.totalFillRgb[2]
  );
  const borderW = 0.75;

  // ------------------------------------------------------------
  // 1. Header Date (`Date : {renewalDate}`)
  // ------------------------------------------------------------
  const renDate = sanitizePdfText(data.renewalDate || data.contractDate || "");
  const dateRightMaxX = layout.pageWidth - 14;
  const dateText = renDate ? `Date : ${renDate}` : "";
  let dateFontSize = 9.8;
  while (dateFontSize > 8.0 && fontBold.widthOfTextAtSize(dateText, dateFontSize) > 165) {
    dateFontSize -= 0.3;
  }
  const dateW = dateText ? fontBold.widthOfTextAtSize(dateText, dateFontSize) : 0;
  const effDateX = Math.max(
    410,
    Math.min(layout.fields.dateX, dateRightMaxX - dateW - 2)
  );
  page1.drawRectangle({
    x: effDateX - 8,
    y: layout.fields.dateY - 6,
    width: layout.pageWidth - 10 - (effDateX - 8),
    height: 19,
    color: white,
  });
  if (renDate) {
    drawLabeledWrappedField(page1, {
      label: "Date : ",
      value: renDate,
      x: effDateX,
      y: layout.fields.dateY,
      maxX: dateRightMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: dateFontSize,
      lineSpacing: 11,
      labelGap: 2,
    });
  }

  // ------------------------------------------------------------
  // 2. Recipient (`TO,` + `customerName` + wrapped `customerAddress`)
  // ------------------------------------------------------------
  const cName = sanitizePdfText(
    data.customerName || data.customerCompanyName || data.customerFullName || ""
  );
  const cAddr = sanitizePdfText(data.customerAddress || "");
  const custX = layout.fields.custX;
  const custMaxX = effDateX - 14;
  const custTopY = layout.fields.custTopY;
  const custMinY = layout.fields.subY + 8;

  page1.drawRectangle({
    x: custX - 6,
    y: custMinY,
    width: custMaxX - (custX - 6),
    height: layout.fields.toY - 2 - custMinY,
    color: white,
  });

  const availCustH = custTopY - custMinY + 5;
  const custSteps = [
    { nameSize: 9.2, nameStep: 11, addrSize: 8.4, addrStep: 10 },
    { nameSize: 8.4, nameStep: 10, addrSize: 7.7, addrStep: 9 },
    { nameSize: 7.8, nameStep: 9, addrSize: 7.1, addrStep: 8.2 },
  ];
  let custStep = custSteps[custSteps.length - 1];
  let cNameLines = [];
  let cAddrLines = [];
  for (const step of custSteps) {
    const nl = cName ? wrapTextByFontMetrics(cName, custMaxX - custX, fontBold, step.nameSize) : [];
    const al = cAddr ? wrapTextByFontMetrics(cAddr, custMaxX - custX, fontRegular, step.addrSize) : [];
    const needed = nl.length * step.nameStep + (al.length > 0 ? 1.5 + al.length * step.addrStep : 0);
    custStep = step;
    cNameLines = nl;
    cAddrLines = al;
    if (needed <= availCustH) break;
  }

  let cy = custTopY;
  for (const line of cNameLines) {
    if (cy < custMinY + 2) break;
    if (line) page1.drawText(line, { x: custX, y: cy, size: custStep.nameSize, font: fontBold, color: black });
    cy -= custStep.nameStep;
  }
  cy -= 1.5;
  for (const line of cAddrLines) {
    if (cy < custMinY + 2) break;
    if (line) page1.drawText(line, { x: custX, y: cy, size: custStep.addrSize, font: fontRegular, color: black });
    cy -= custStep.addrStep;
  }

  // ------------------------------------------------------------
  // 3. Measure All Service Rows & Total Row (Zero `.slice()` Truncation)
  // ------------------------------------------------------------
  const tbl = layout.table;
  const colX = tbl.colX;
  const headerH = tbl.headerTopY - tbl.headerBottomY;

  const services =
    Array.isArray(data.services) && data.services.length > 0
      ? data.services
      : [
          {
            serviceNumber: "1",
            location: data.premisesTreated || data.location || cAddr || "",
            serviceName: data.serviceName || data.treatmentType || "Pest Control Services",
            frequency: data.frequency || "Monthly",
            amount: data.totalAmount || "0.00",
          },
        ];

  const locMaxW = colX[2] - colX[1] - 12;
  const nameMaxW = colX[3] - colX[2] - 12;
  const freqMaxW = colX[4] - colX[3] - 10;

  const measuredRows = services.map((srv, idx) => {
    const sNum = sanitizePdfText(String(srv.serviceNumber || idx + 1));
    const loc = sanitizePdfText(srv.location || srv.address || data.premisesTreated || "");
    const name = sanitizePdfText(srv.serviceName || srv.serviceType || "");
    const freq = sanitizePdfText(srv.frequency || "");
    const rawCost = srv.amount !== undefined ? srv.amount : srv.serviceCost !== undefined ? srv.serviceCost : "0.00";
    const costNum = Number(String(rawCost).replace(/,/g, ""));
    const costStr = Number.isFinite(costNum)
      ? costNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : sanitizePdfText(String(rawCost));

    const locLines = wrapTextByFontMetrics(loc, locMaxW, fontRegular, 8.4);
    const nameLines = wrapTextByFontMetrics(name, nameMaxW, fontRegular, 8.4);
    const freqLines = wrapTextByFontMetrics(freq, freqMaxW, fontRegular, 8.4);
    const maxLines = Math.max(locLines.length, nameLines.length, freqLines.length, 1);
    const rowHeight = Math.max(24, maxLines * 10.5 + 10);

    return { sNum, locLines, nameLines, freqLines, costStr, rowHeight };
  });

  // Clean AMOUNT IN WORDS (deduplicate any leading "Rupees" / trailing "Only")
  let cleanWords = sanitizePdfText(data.amountInWords || "").trim();
  while (/^(?:rupees|rs\.?)\b/i.test(cleanWords)) {
    cleanWords = cleanWords.replace(/^(?:rupees|rs\.?)\s*/i, "").trim();
  }
  while (/\bonly$/i.test(cleanWords)) {
    cleanWords = cleanWords.replace(/\s*only$/i, "").trim();
  }
  const amountWordsDisplay = cleanWords ? `RUPEES ${cleanWords.toUpperCase()} ONLY` : "";

  const totalRaw =
    data.totalAmount !== undefined && data.totalAmount !== null && data.totalAmount !== ""
      ? data.totalAmount
      : "0.00";
  const totalNum = Number(String(totalRaw).replace(/,/g, ""));
  const formattedTotal = Number.isFinite(totalNum)
    ? totalNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : sanitizePdfText(String(totalRaw));

  const wordsM = measureLabeledField(
    "AMOUNT IN WORDS – ",
    amountWordsDisplay,
    colX[0] + 6,
    colX[4] - 8,
    fontBold,
    fontBold,
    8.2,
    10,
    2
  );
  const totalRowHeight = Math.max(22.5, wordsM.height + 10);

  const drawRenewalTableHeader = (targetPage, hTop, hBottom) => {
    const hH = hTop - hBottom;
    targetPage.drawRectangle({
      x: colX[0] - 1,
      y: hBottom - 0.5,
      width: colX[5] - colX[0] + 2,
      height: hH + 1,
      color: white,
    });
    targetPage.drawRectangle({
      x: colX[0],
      y: hBottom,
      width: colX[5] - colX[0],
      height: hH,
      color: headerBg,
    });
    const hdrs = [
      { text: "N O", x0: colX[0], x1: colX[1] },
      { text: "Location to be Treated", x0: colX[1], x1: colX[2] },
      { text: "Service Name", x0: colX[2], x1: colX[3] },
      { text: "Frequency", x0: colX[3], x1: colX[4] },
      { text: "Service Cost", x0: colX[4], x1: colX[5] },
    ];
    const ly = hBottom + hH / 2 - 2.8;
    for (const h of hdrs) {
      drawCenteredText(targetPage, h.text, h.x0, h.x1, ly, 8.2, fontBold, black);
    }
    drawHBorder(targetPage, colX[0], colX[5], hTop, borderW, black);
    drawHBorder(targetPage, colX[0], colX[5], hBottom, borderW, black);
    for (const vx of colX) {
      drawVBorder(targetPage, vx, hBottom, hTop, borderW, black);
    }
  };

  const drawRenewalServiceRow = (targetPage, row, rowTopY) => {
    const rowBottomY = rowTopY - row.rowHeight;
    const midY = rowBottomY + row.rowHeight / 2 - 3;

    targetPage.drawRectangle({
      x: colX[0],
      y: rowBottomY,
      width: colX[5] - colX[0],
      height: row.rowHeight,
      color: rowBg,
    });

    drawCenteredText(targetPage, row.sNum, colX[0], colX[1], midY, 8.8, fontBold, black);

    row.locLines.forEach((l, lIdx) => {
      if (l) {
        targetPage.drawText(l, {
          x: colX[1] + 6,
          y: rowTopY - 12 - lIdx * 10.5,
          size: 8.4,
          font: fontRegular,
          color: black,
        });
      }
    });

    row.nameLines.forEach((l, nIdx) => {
      if (l) {
        targetPage.drawText(l, {
          x: colX[2] + 6,
          y: rowTopY - 12 - nIdx * 10.5,
          size: 8.4,
          font: fontRegular,
          color: black,
        });
      }
    });

    const freqStartY = row.freqLines.length > 1 ? rowTopY - 12 : midY;
    row.freqLines.forEach((l, fIdx) => {
      if (l) {
        drawCenteredText(
          targetPage,
          l,
          colX[3],
          colX[4],
          freqStartY - fIdx * 10.5,
          8.4,
          fontRegular,
          black
        );
      }
    });

    drawRightAlignedText(targetPage, row.costStr, colX[5] - 8, midY, 8.6, fontRegular, black);

    drawHBorder(targetPage, colX[0], colX[5], rowBottomY, borderW, black);
    for (const vx of colX) {
      drawVBorder(targetPage, vx, rowBottomY, rowTopY, borderW, black);
    }
    return rowBottomY;
  };

  const drawRenewalTotalRow = (targetPage, totalTopY) => {
    const totalBottomY = totalTopY - totalRowHeight;
    targetPage.drawRectangle({
      x: colX[0],
      y: totalBottomY,
      width: colX[5] - colX[0],
      height: totalRowHeight,
      color: totalBg,
    });

    const wordsStartY = totalBottomY + (totalRowHeight + wordsM.height) / 2 - 8;
    drawLabeledWrappedField(targetPage, {
      label: "AMOUNT IN WORDS – ",
      value: amountWordsDisplay,
      x: colX[0] + 6,
      y: wordsStartY,
      maxX: colX[4] - 8,
      fontRegular: fontBold,
      fontBold,
      fontSize: 8.2,
      lineSpacing: 10,
      labelGap: 2,
    });

    const totalAmtY = totalBottomY + totalRowHeight / 2 - 3;
    drawRightAlignedText(targetPage, formattedTotal, colX[5] - 8, totalAmtY, 8.8, fontBold, black);

    drawHBorder(targetPage, colX[0], colX[5], totalBottomY, borderW, black);
    drawVBorder(targetPage, colX[0], totalBottomY, totalTopY, borderW, black);
    drawVBorder(targetPage, colX[4], totalBottomY, totalTopY, borderW, black);
    drawVBorder(targetPage, colX[5], totalBottomY, totalTopY, borderW, black);
    return totalBottomY;
  };

  // ------------------------------------------------------------
  // 4. Measure Summary Bullets & Full T&C + Acceptance + Contractee Flow
  // ------------------------------------------------------------
  const bulletX = 21.84;
  const bulletTextX = bulletX + 10;
  const bulletMaxX = colX[5] - 2;
  const cPeriod = sanitizePdfText(data.contractPeriod || "");
  const payTerm = sanitizePdfText(
    data.paymentTerms || data.paymentTerm || "Within 10 days from submission of bill."
  );

  const cPeriodM = measureLabeledField(
    "Contract Period : ",
    cPeriod,
    bulletTextX,
    bulletMaxX,
    fontBold,
    fontBold,
    8.2,
    10.2,
    3
  );
  const payTermM = measureLabeledField(
    "Payment Term : ",
    payTerm,
    bulletTextX,
    bulletMaxX,
    fontRegular,
    fontBold,
    8.0,
    10.2,
    3
  );
  const bulletsTotalH = (cPeriodM.height + 2) + 10.5 + 10.5 + (payTermM.height + 4);

  const tcBulletX = 14.64;
  const tcTextX = 25;
  const tcMaxX = colX[5] - 4;
  const tcList = layout.tcBullets.length > 0 ? layout.tcBullets : [
    "GST, is applicable as per the prevailing rate while invoicing and any changes in tax structure as bought in by the Government of India shall be binding on either parties.",
    "Services shall be rendered during working hrs with All days.",
  ];
  const measuredTc = tcList.map((txt) => ({
    lines: wrapTextByFontMetrics(txt, tcMaxX - tcTextX, fontRegular, 6.9),
  }));
  const tcBulletsH = measuredTc.reduce((acc, b) => acc + b.lines.length * 8.4 + 1.2, 0);
  const stampH = layout.stampImage ? layout.stampImage.height : 34;
  const fullLowerFooterH =
    bulletsTotalH + 16 + tcBulletsH + 14 + stampH + 28 + 38;

  const drawSummaryBullets = (targetPage, startY) => {
    let by = startY;
    targetPage.drawText("•", { x: bulletX, y: by, size: 8.5, font: fontRegular, color: black });
    const cpRes = drawLabeledWrappedField(targetPage, {
      label: "Contract Period : ",
      value: cPeriod,
      x: bulletTextX,
      y: by,
      maxX: bulletMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: 8.2,
      lineSpacing: 10.2,
      labelGap: 3,
    });
    by = cpRes.bottomY - 10.5;

    targetPage.drawText("•", { x: bulletX, y: by, size: 8.5, font: fontRegular, color: black });
    targetPage.drawText(
      "All payments should be made payable to Samarth Pest Management via GPAY / RTGS / Cheque.",
      { x: bulletTextX, y: by, size: 8.0, font: fontRegular, color: black }
    );
    by -= 10.5;

    targetPage.drawText("•", { x: bulletX, y: by, size: 8.5, font: fontRegular, color: black });
    targetPage.drawText(
      "The above quote is exclusive of GST and will be charged as per applicable rate.",
      { x: bulletTextX, y: by, size: 8.0, font: fontRegular, color: black }
    );
    by -= 10.5;

    targetPage.drawText("•", { x: bulletX, y: by, size: 8.5, font: fontRegular, color: black });
    const ptRes = drawLabeledWrappedField(targetPage, {
      label: "Payment Term : ",
      value: payTerm,
      x: bulletTextX,
      y: by,
      maxX: bulletMaxX,
      fontRegular,
      fontBold,
      fontSize: 8.0,
      lineSpacing: 10.2,
      labelGap: 3,
    });
    return ptRes.bottomY;
  };

  const cPerson = sanitizePdfText(data.contracteeName || data.contactPerson || cName);
  const cMobile = sanitizePdfText(data.contracteeMobile || data.customerPhone || "");

  const drawContracteeLine = (targetPage, cyPos) => {
    targetPage.drawText(`Name : ${cPerson}`, {
      x: 42,
      y: cyPos,
      size: 9.2,
      font: fontBold,
      color: black,
    });
    targetPage.drawText(`Mobile : ${cMobile}`, {
      x: 365,
      y: cyPos,
      size: 9.2,
      font: fontBold,
      color: black,
    });
  };

  const drawFullFooterFrom = (targetPage, tableBottomY) => {
    let fy = drawSummaryBullets(targetPage, tableBottomY - 11);
    fy -= 16;

    drawCenteredText(
      targetPage,
      "Terms and conditions",
      colX[0],
      colX[5],
      fy,
      9.0,
      fontBold,
      black
    );
    fy -= 11;

    for (const b of measuredTc) {
      targetPage.drawText("•", { x: tcBulletX, y: fy, size: 7.5, font: fontRegular, color: black });
      for (const l of b.lines) {
        if (l) {
          targetPage.drawText(l, { x: tcTextX, y: fy, size: 6.9, font: fontRegular, color: black });
        }
        fy -= 8.4;
      }
      fy -= 1.2;
    }

    fy -= 4;
    targetPage.drawText("Yours Faithfully", {
      x: 443,
      y: fy,
      size: 8.0,
      font: fontRegular,
      color: black,
    });
    fy -= 11;
    targetPage.drawText("SAMARTH PEST MANAGEMENT", {
      x: 410.5,
      y: fy,
      size: 8.8,
      font: fontBold,
      color: black,
    });

    if (layout.stampImage) {
      const sy = fy - layout.stampImage.height - 3;
      drawExistingPageImageXObject(targetPage, layout.stampImage, layout.stampImage.x0, sy);
      fy = sy - 11;
    } else {
      fy -= 34;
    }

    targetPage.drawText(
      "WE HAVE READ ALL THE ABOVE RULES, TERMS AND CONDITIONS OF SERVICE AND WE / I ACCEPT THE SAME.",
      { x: colX[0], y: fy, size: 9.2, font: fontBold, color: black }
    );
    fy -= 12.5;
    targetPage.drawText("WE HEREBY CONFIRM", {
      x: colX[0],
      y: fy,
      size: 9.2,
      font: fontBold,
      color: black,
    });
    fy -= 32;
    drawContracteeLine(targetPage, Math.max(24, fy));
  };

  // ------------------------------------------------------------
  // 5. Choose Compact Single-Page, Expanded Single-Page, or Multi-Page Continuation
  // ------------------------------------------------------------
  const totalServicesH = measuredRows.reduce((acc, r) => acc + r.rowHeight, 0);
  const compactThresholdY = layout.fields.tcHeadingY + 10; // keep static T&C + stamp intact if possible

  if (tbl.headerBottomY - totalServicesH - totalRowHeight - 11 - bulletsTotalH >= compactThresholdY) {
    // COMPACT SINGLE-PAGE PATH: preserves original T&C + Stamp untouched
    page1.drawRectangle({
      x: 12,
      y: compactThresholdY - 1,
      width: layout.pageWidth - 20,
      height: tbl.headerBottomY - compactThresholdY + 1,
      color: white,
    });

    let ry = tbl.headerBottomY;
    for (const row of measuredRows) {
      ry = drawRenewalServiceRow(page1, row, ry);
    }
    const effTotalBottomY = drawRenewalTotalRow(page1, ry);
    drawHBorder(page1, colX[0], colX[5], tbl.headerBottomY, borderW, black);
    drawSummaryBullets(page1, effTotalBottomY - 11);

    // Replace only Contractee Name & Mobile cleanly
    page1.drawRectangle({
      x: 35,
      y: layout.fields.contracteeY - 10,
      width: layout.pageWidth - 55,
      height: 24,
      color: white,
    });
    drawContracteeLine(page1, layout.fields.contracteeY);
    return pdfDoc;
  }

  const page1MinY = 26;
  const expandedBottomY = tbl.headerBottomY - totalServicesH - totalRowHeight - fullLowerFooterH;

  if (expandedBottomY >= page1MinY) {
    // EXPANDED SINGLE-PAGE PATH: flows T&C, Stamp, & Contractee seamlessly below expanded table
    page1.drawRectangle({
      x: 0,
      y: 0,
      width: layout.pageWidth,
      height: tbl.headerBottomY - 0.5,
      color: white,
    });
    drawHBorder(page1, colX[0], colX[5], tbl.headerBottomY, borderW, black);

    let ry = tbl.headerBottomY;
    for (const row of measuredRows) {
      ry = drawRenewalServiceRow(page1, row, ry);
    }
    const effTotalBottomY = drawRenewalTotalRow(page1, ry);
    drawFullFooterFrom(page1, effTotalBottomY);
    return pdfDoc;
  }

  // MULTI-PAGE OVERFLOW PATH (preserves letterhead on continuation pages + footer/stamp on final page)
  const cleanBytes = templateBytes || (await pdfDoc.save());
  const templateCopyDoc = await PDFDocument.load(cleanBytes);

  const page1ContBottomY = 58;
  page1.drawRectangle({
    x: 0,
    y: 0,
    width: layout.pageWidth,
    height: tbl.headerBottomY - 0.5,
    color: white,
  });
  drawHBorder(page1, colX[0], colX[5], tbl.headerBottomY, borderW, black);

  const reserveLimit = measuredRows.length > 1 ? measuredRows.length - 1 : 0;
  let nextIdx = 0;
  let p1Y = tbl.headerBottomY;
  while (nextIdx < reserveLimit) {
    const row = measuredRows[nextIdx];
    if (p1Y - row.rowHeight < page1ContBottomY && nextIdx > 0) break;
    p1Y = drawRenewalServiceRow(page1, row, p1Y);
    nextIdx++;
  }
  drawRightAlignedText(page1, "Continued on next page...", colX[5], p1Y - 14, 8.2, fontRegular, black);

  const contTitleY = Math.min(layout.headerBannerBottomY - 18, 718);
  const contHeaderTop = contTitleY - 12;
  const contHeaderBottom = contHeaderTop - headerH;
  const contMaxFinalRowsH = contHeaderBottom - totalRowHeight - fullLowerFooterH - page1MinY;
  const remainingHFrom = (startIdx) =>
    measuredRows.slice(startIdx).reduce((acc, r) => acc + r.rowHeight, 0);

  while (nextIdx < measuredRows.length && remainingHFrom(nextIdx) > contMaxFinalRowsH) {
    const [midPage] = await pdfDoc.copyPages(templateCopyDoc, [0]);
    pdfDoc.addPage(midPage);
    midPage.drawRectangle({
      x: 0,
      y: 0,
      width: layout.pageWidth,
      height: layout.headerBannerBottomY - 3,
      color: white,
    });
    midPage.drawText("CONTRACT FORM (Continued)", {
      x: colX[0],
      y: contTitleY,
      size: 9.5,
      font: fontBold,
      color: black,
    });
    drawRenewalTableHeader(midPage, contHeaderTop, contHeaderBottom);

    let my = contHeaderBottom;
    const startCount = nextIdx;
    while (nextIdx < reserveLimit) {
      const row = measuredRows[nextIdx];
      if (my - row.rowHeight < page1ContBottomY && nextIdx > startCount) break;
      my = drawRenewalServiceRow(midPage, row, my);
      nextIdx++;
    }
    drawRightAlignedText(midPage, "Continued on next page...", colX[5], my - 14, 8.2, fontRegular, black);
  }

  // Final Continuation Page
  const [finalPage] = await pdfDoc.copyPages(templateCopyDoc, [0]);
  pdfDoc.addPage(finalPage);
  finalPage.drawRectangle({
    x: 0,
    y: 0,
    width: layout.pageWidth,
    height: layout.headerBannerBottomY - 3,
    color: white,
  });
  finalPage.drawText("CONTRACT FORM (Continued)", {
    x: colX[0],
    y: contTitleY,
    size: 9.5,
    font: fontBold,
    color: black,
  });
  drawRenewalTableHeader(finalPage, contHeaderTop, contHeaderBottom);

  let fy = contHeaderBottom;
  while (nextIdx < measuredRows.length) {
    fy = drawRenewalServiceRow(finalPage, measuredRows[nextIdx], fy);
    nextIdx++;
  }
  const effFinalTotalBottom = drawRenewalTotalRow(finalPage, fy);
  drawFullFooterFrom(finalPage, effFinalTotalBottom);

  return pdfDoc;
}

// ============================================================
// 5. ONE TIME JOB SERVICE PAPER PDF GENERATOR (`one-time-job`)
// ============================================================

function drawOneTimeJobFooter(page, footerTopY, layout, fonts, gpayNumber) {
  const black = rgb(0, 0, 0);
  const { regular: fontRegular, sansRegular, sansBold, serifItalic } = fonts;
  const origBottomY = layout.rows.remark.bottomY;
  const gpayStr = sanitizePdfText(gpayNumber || "8356080548");

  const gpayDy = origBottomY - (layout.footer?.gpayY ?? 228.41);
  const gpayX = layout.footer?.gpayX ?? 78.02;
  const gpayY = footerTopY - gpayDy;
  page.drawText("\u2022", {
    x: gpayX,
    y: gpayY,
    size: 11.5,
    font: fontRegular,
    color: black,
  });
  page.drawText(`Payment can be made via GPAY no. ${gpayStr}`, {
    x: 100.34,
    y: gpayY,
    size: 11.5,
    font: fontRegular,
    color: black,
  });

  const payAllY = footerTopY - (origBottomY - 212.66);
  page.drawText("\u2022", {
    x: gpayX,
    y: payAllY,
    size: 11.5,
    font: fontRegular,
    color: black,
  });
  page.drawText("All payments should be made payable to Samarth Pest Management.", {
    x: 100.34,
    y: payAllY,
    size: 11.5,
    font: fontRegular,
    color: black,
  });

  const thanksY = footerTopY - (origBottomY - 190.22);
  page.drawText("Thanks & Regards", {
    x: 424.63,
    y: thanksY,
    size: 13.5,
    font: serifItalic || fontRegular,
    color: black,
  });

  const bankHdrY = footerTopY - (origBottomY - 172.58);
  page.drawText("BANK DETAILS:", {
    x: 83.06,
    y: bankHdrY,
    size: 11,
    font: sansBold,
    color: black,
  });
  page.drawText("For ", {
    x: 389.35,
    y: bankHdrY,
    size: 9,
    font: sansRegular,
    color: black,
  });
  page.drawText("SAMARTH PEST MANAGEMENT", {
    x: 403.87,
    y: bankHdrY,
    size: 11,
    font: sansBold,
    color: black,
  });

  for (const imgBox of layout.footer?.images || []) {
    const dyImg = origBottomY - imgBox.y0;
    drawExistingPageImageXObject(page, imgBox, imgBox.x0, footerTopY - dyImg);
  }
}

export async function generateOneTimeJobPdf(
  pdfDoc,
  data,
  inspection = null,
  templateBytes = null
) {
  const pages = pdfDoc.getPages();
  if (pages.length === 0) throw new Error("PDF template has no pages");

  const resolvedInspection =
    inspection ||
    (templateBytes ? await inspectPdfTemplate(templateBytes) : null) ||
    (await inspectPdfTemplate(await pdfDoc.save()));
  const layout = resolveOneTimeJobPdfLayout(resolvedInspection);

  const cleanSourceBytes = templateBytes || (await pdfDoc.save());
  const page1 = pages[0];
  const { pageWidth, pageHeight, borderW } = layout;
  const { leftX, splitX, occSplit1X, occSplit2X, rightX } = layout.cols;

  const fontFamilies = await selectDocumentFonts(pdfDoc, layout.fontFamily);
  const serifItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const fonts = { ...fontFamilies, serifItalic };
  const { regular: fontRegular, bold: fontBold } = fonts;

  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);

  // Measure Meta block inside [leftX .. rightX]
  const metaX = leftX + 5.5;
  const metaMaxX = rightX - 6;
  const metaFontSize = 11.5;
  const metaLineSpacing = 14.5;
  const metaFieldGap = 4;

  const jobNoStr = sanitizePdfText(data.jobNo || "");
  const jobLabel = "JOB NO - ";
  const jobValX = metaX + fontBold.widthOfTextAtSize(jobLabel, metaFontSize) + 4;
  const jobLines = wrapTextByFontMetrics(
    jobNoStr,
    Math.max(20, metaMaxX - jobValX),
    fontBold,
    metaFontSize
  );

  const clientMetaSpecs = [
    { label: "Client Name :", value: sanitizePdfText(data.customerName || "") },
    {
      label: "Address :",
      value: sanitizePdfText(data.customerAddress || data.address || ""),
    },
    { label: "Contact Person :", value: sanitizePdfText(data.contactPerson || "") },
    { label: "Contact Number :", value: sanitizePdfText(data.contactNumber || "") },
  ];
  const clientTargetX =
    metaX + fontBold.widthOfTextAtSize("Contact Number :", metaFontSize) + 6;
  const clientAvailW = Math.max(20, metaMaxX - clientTargetX);
  const clientMeasured = clientMetaSpecs.map((spec) => ({
    ...spec,
    lines: wrapTextByFontMetrics(spec.value, clientAvailW, fontRegular, metaFontSize),
  }));

  const metaTotalLines =
    Math.max(1, jobLines.length) +
    clientMeasured.reduce((acc, item) => acc + Math.max(1, item.lines.length), 0);
  const origMetaH = layout.rows.meta.topY - layout.rows.meta.bottomY;
  const metaNeededH =
    16 +
    (metaTotalLines - 1) * metaLineSpacing +
    clientMeasured.length * metaFieldGap +
    12;
  const effMetaH = Math.max(origMetaH, metaNeededH);

  // Measure 5 Description rows
  const rawCharges = sanitizePdfText(
    data.serviceCharges || data.amount || ""
  ).trim();
  const formattedCharges = rawCharges
    ? /^rs\.?/i.test(rawCharges)
      ? rawCharges
      : `Rs. ${rawCharges} /--`
    : "";

  const descValX = splitX + 6;
  const descValMaxX = rightX - 6;
  const descAvailW = Math.max(20, descValMaxX - descValX);
  const descFontSize = 11;
  const descLineSpacing = 14;

  const descSpecs = [
    {
      key: "typeOfService",
      value: sanitizePdfText(data.serviceName || data.name || ""),
      boldVal: false,
    },
    {
      key: "premisesArea",
      value: sanitizePdfText(data.area || data.premisesArea || ""),
      boldVal: false,
    },
    {
      key: "locationOfPest",
      value: sanitizePdfText(data.locationOfPest || ""),
      boldVal: false,
    },
    {
      key: "frequency",
      value: sanitizePdfText(data.frequency || ""),
      boldVal: false,
    },
    {
      key: "serviceCharges",
      value: formattedCharges,
      boldVal: true,
    },
  ].map((spec) => {
    const tplRow = layout.rows[spec.key];
    const origH = tplRow.topY - tplRow.bottomY;
    const valFont = spec.boldVal ? fontBold : fontRegular;
    const lines = wrapTextByFontMetrics(spec.value, descAvailW, valFont, descFontSize);
    const effH =
      lines.length <= 1 ? origH : Math.max(origH, lines.length * descLineSpacing + 10);
    return {
      ...spec,
      label: tplRow.label,
      tplRow,
      origH,
      effH,
      valFont,
      lines,
    };
  });

  // Measure 5 Occurrence rows (3 columns)
  const occFontSize = 10.5;
  const occLineSpacing = 13;
  const occColBounds = [
    { x: splitX + 5.5, maxX: occSplit1X - 5, suffix: "1", fallback: true },
    { x: occSplit1X + 5.5, maxX: occSplit2X - 5, suffix: "2", fallback: false },
    { x: occSplit2X + 5.5, maxX: rightX - 5.5, suffix: "3", fallback: false },
  ];

  const occKeys = [
    "serviceDate",
    "serviceTime",
    "operatorName",
    "clientSignature",
    "paymentDetails",
  ];
  const occRows = occKeys.map((key) => {
    const tplRow = layout.rows[key];
    const origH = tplRow.topY - tplRow.bottomY;
    const cols = occColBounds.map((col) => {
      const raw = data[`${key}${col.suffix}`] ?? (col.fallback ? data[key] : "") ?? "";
      const val = sanitizePdfText(raw);
      const availW = Math.max(18, col.maxX - col.x);
      return {
        ...col,
        value: val,
        lines: wrapTextByFontMetrics(val, availW, fontRegular, occFontSize),
      };
    });
    const maxLines = Math.max(1, ...cols.map((c) => c.lines.length));
    const neededH = maxLines * occLineSpacing + 12;
    const effH = neededH <= origH ? origH : neededH;
    return {
      key,
      label: tplRow.label,
      tplRow,
      origH,
      effH,
      cols,
      maxLines,
    };
  });

  // Measure Remark row ([splitX .. rightX] merged)
  const remarkTpl = layout.rows.remark;
  const origRemarkH = remarkTpl.topY - remarkTpl.bottomY;
  const remarkFontSize = 10.5;
  const remarkLineSpacing = 13.5;
  const remarkStr = sanitizePdfText(data.remark || data.desc || "");
  const remarkLines = wrapTextByFontMetrics(
    remarkStr,
    Math.max(20, descAvailW),
    fontRegular,
    remarkFontSize
  );
  const neededRemarkH =
    remarkLines.length <= 2
      ? origRemarkH
      : Math.max(origRemarkH, remarkLines.length * remarkLineSpacing + 12);
  const effRemarkH = neededRemarkH;

  // Helpers for drawing cell contents
  const drawMetaContents = (page, topY) => {
    let cursorY = topY - 16;
    drawLabeledWrappedField(page, {
      label: jobLabel,
      value: jobNoStr,
      x: metaX,
      y: cursorY,
      maxX: metaMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: metaFontSize,
      lineSpacing: metaLineSpacing,
      labelGap: 4,
    });
    cursorY -= Math.max(1, jobLines.length) * metaLineSpacing + metaFieldGap;

    for (const item of clientMeasured) {
      drawLabeledWrappedField(page, {
        label: item.label,
        value: item.value,
        x: metaX,
        y: cursorY,
        maxX: metaMaxX,
        fontRegular,
        fontBold,
        fontSize: metaFontSize,
        lineSpacing: metaLineSpacing,
        targetValueStartX: clientTargetX,
      });
      cursorY -= Math.max(1, item.lines.length) * metaLineSpacing + metaFieldGap;
    }
  };

  const drawDescValueLines = (page, row, topY) => {
    if (!row.lines.some(Boolean)) return;
    const firstBaseY =
      row.lines.length <= 1
        ? topY - row.effH / 2 - descFontSize * 0.32
        : topY - 14;
    row.lines.forEach((line, idx) => {
      if (!line) return;
      page.drawText(line, {
        x: descValX,
        y: firstBaseY - idx * descLineSpacing,
        size: descFontSize,
        font: row.valFont,
        color: black,
      });
    });
  };

  const drawOccRowCells = (page, row, topY) => {
    const singleBaseY = topY - Math.min(18, Math.max(12.5, row.effH * 0.42));
    const multiBaseY = topY - 13.5;
    row.cols.forEach((col) => {
      if (!col.lines.some(Boolean)) return;
      const baseY = col.lines.length <= 1 ? singleBaseY : multiBaseY;
      col.lines.forEach((line, idx) => {
        if (!line) return;
        page.drawText(line, {
          x: col.x,
          y: baseY - idx * occLineSpacing,
          size: occFontSize,
          font: fontRegular,
          color: black,
        });
      });
    });
  };

  const drawRemarkLines = (page, topY) => {
    if (!remarkLines.some(Boolean)) return;
    const baseY =
      remarkLines.length <= 1
        ? topY - effRemarkH / 2 - remarkFontSize * 0.32
        : topY - 13.5;
    remarkLines.forEach((line, idx) => {
      if (!line) return;
      page.drawText(line, {
        x: descValX,
        y: baseY - idx * remarkLineSpacing,
        size: remarkFontSize,
        font: fontRegular,
        color: black,
      });
    });
  };

  const origDescHeadingH =
    layout.rows.descHeading.topY - layout.rows.descHeading.bottomY;
  const origOccHeaderH = layout.rows.occHeader.topY - layout.rows.occHeader.bottomY;

  const totalOrigH =
    origMetaH +
    origDescHeadingH +
    descSpecs.reduce((s, r) => s + r.origH, 0) +
    origOccHeaderH +
    occRows.reduce((s, r) => s + r.origH, 0) +
    origRemarkH;

  const totalEffH =
    effMetaH +
    origDescHeadingH +
    descSpecs.reduce((s, r) => s + r.effH, 0) +
    origOccHeaderH +
    occRows.reduce((s, r) => s + r.effH, 0) +
    effRemarkH;

  const gpayStr = sanitizePdfText(data.gpayNumber || "8356080548");

  // Case A: Everything fits inside original template cell heights -> preserve ALL static labels, borders, bank card, QR, stamp
  if (Math.abs(totalEffH - totalOrigH) <= 0.5) {
    maskCellInterior(
      page1,
      leftX,
      layout.rows.meta.bottomY,
      rightX,
      layout.rows.meta.topY,
      white,
      1.6
    );
    drawMetaContents(page1, layout.rows.meta.topY);

    for (const row of descSpecs) {
      maskCellInterior(
        page1,
        splitX,
        row.tplRow.bottomY,
        rightX,
        row.tplRow.topY,
        white,
        1.5
      );
      drawDescValueLines(page1, row, row.tplRow.topY);
    }

    for (const row of occRows) {
      maskCellInterior(
        page1,
        splitX,
        row.tplRow.bottomY,
        occSplit1X,
        row.tplRow.topY,
        white,
        1.4
      );
      maskCellInterior(
        page1,
        occSplit1X,
        row.tplRow.bottomY,
        occSplit2X,
        row.tplRow.topY,
        white,
        1.4
      );
      maskCellInterior(
        page1,
        occSplit2X,
        row.tplRow.bottomY,
        rightX,
        row.tplRow.topY,
        white,
        1.4
      );
      drawOccRowCells(page1, row, row.tplRow.topY);
    }

    maskCellInterior(
      page1,
      splitX,
      remarkTpl.bottomY,
      rightX,
      remarkTpl.topY,
      white,
      1.5
    );
    drawRemarkLines(page1, remarkTpl.topY);

    const gpayX = layout.footer?.gpayX ?? 78.02;
    const gpayY = layout.footer?.gpayY ?? 228.41;
    page1.drawRectangle({
      x: gpayX - 2,
      y: gpayY - 4,
      width: rightX - gpayX - 4,
      height: 15,
      color: white,
    });
    page1.drawText("\u2022", {
      x: gpayX,
      y: gpayY,
      size: 11.5,
      font: fontRegular,
      color: black,
    });
    page1.drawText(`Payment can be made via GPAY no. ${gpayStr}`, {
      x: 100.34,
      y: gpayY,
      size: 11.5,
      font: fontRegular,
      color: black,
    });

    return pdfDoc;
  }

  // Case B: One or more rows expanded -> clean dynamic redraw + XObject footer shift + multi-page continuation
  const cleanSrcDoc = await PDFDocument.load(cleanSourceBytes);
  const coverFloorY = 10;
  page1.drawRectangle({
    x: 0,
    y: coverFloorY,
    width: pageWidth,
    height: layout.rows.meta.topY + 1 - coverFloorY,
    color: white,
  });

  const blocks = [
    { kind: "meta", effH: effMetaH },
    { kind: "descHeading", effH: origDescHeadingH },
    ...descSpecs.map((r) => ({ kind: "desc", row: r, effH: r.effH })),
    { kind: "occHeader", effH: Math.max(16, origOccHeaderH) },
    ...occRows.map((r) => ({ kind: "occ", row: r, effH: r.effH })),
    { kind: "remark", effH: effRemarkH },
  ];

  const minImgBottom = Math.min(
    ...(layout.footer?.images || []).map((i) => i.y0),
    117.92
  );
  const footerNeededH = layout.rows.remark.bottomY - minImgBottom + 8;
  const pageBottomMargin = 26;
  const contTableTopY = layout.rows.meta.topY;

  let curPage = page1;
  let curY = layout.rows.meta.topY;
  let pageChunkTopY = curY;
  let pageSplitTopY = null;
  let pageSplitBottomY = null;
  let pageOccTopY = null;
  let pageOccBottomY = null;
  let pageHasRows = false;
  let occHeaderDrawnYet = false;

  const drawOccHeaderRow = (page, topY, height) => {
    const textY = topY - height / 2 - 3;
    drawCenteredText(page, "Service", leftX, splitX, textY, 9, fontBold, black);
    drawCenteredText(
      page,
      "1ST Service / ONE TIME",
      splitX,
      occSplit1X,
      textY,
      8.5,
      fontBold,
      black
    );
    drawCenteredText(
      page,
      "2ND Service / Complaint",
      occSplit1X,
      occSplit2X,
      textY,
      8,
      fontBold,
      black
    );
    drawCenteredText(
      page,
      "3RD Service / Complaint",
      occSplit2X,
      rightX,
      textY,
      8.5,
      fontBold,
      black
    );
    drawHBorder(page, leftX, rightX, topY - height, borderW, black);
  };

  const closeVerticalBordersOnPage = () => {
    if (!pageHasRows) return;
    drawVBorder(curPage, leftX, curY, pageChunkTopY, borderW, black);
    drawVBorder(curPage, rightX, curY, pageChunkTopY, borderW, black);
    if (pageSplitTopY !== null && pageSplitBottomY !== null) {
      drawVBorder(curPage, splitX, pageSplitBottomY, pageSplitTopY, borderW, black);
    }
    if (pageOccTopY !== null && pageOccBottomY !== null) {
      drawVBorder(curPage, occSplit1X, pageOccBottomY, pageOccTopY, 0.75, black);
      drawVBorder(curPage, occSplit2X, pageOccBottomY, pageOccTopY, 0.75, black);
    }
  };

  const startContinuationPage = async () => {
    closeVerticalBordersOnPage();
    const [contPage] = await pdfDoc.copyPages(cleanSrcDoc, [0]);
    pdfDoc.addPage(contPage);
    const maskTopY = (layout.headerBannerBottomY || 734.87) - 1.5;
    contPage.drawRectangle({
      x: 0,
      y: coverFloorY,
      width: pageWidth,
      height: maskTopY - coverFloorY,
      color: white,
    });
    drawCenteredText(
      contPage,
      "SERVICE PAPER (Continued)",
      leftX,
      rightX,
      716.5,
      14,
      fontBold,
      black
    );
    curPage = contPage;
    curY = contTableTopY;
    pageChunkTopY = curY;
    pageSplitTopY = null;
    pageSplitBottomY = null;
    pageOccTopY = null;
    pageOccBottomY = null;
    pageHasRows = false;
  };

  const drawLabelInLeftCol = (page, label, topY, height) => {
    const labelSize = 12.5;
    const labelY =
      height <= 36 ? topY - height / 2 - 4 : topY - 18;
    page.drawText(label, {
      x: leftX + 8.6,
      y: labelY,
      size: labelSize,
      font: fontBold,
      color: black,
    });
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (pageHasRows && curY - block.effH < pageBottomMargin) {
      await startContinuationPage();
      if (block.kind === "occ" && occHeaderDrawnYet) {
        const oh = Math.max(16, origOccHeaderH);
        drawHBorder(curPage, leftX, rightX, curY, borderW, black);
        drawOccHeaderRow(curPage, curY, oh);
        if (pageSplitTopY === null) pageSplitTopY = curY;
        if (pageOccTopY === null) pageOccTopY = curY;
        curY -= oh;
        pageSplitBottomY = curY;
        pageOccBottomY = curY;
        pageHasRows = true;
      }
    }

    if (!pageHasRows) {
      drawHBorder(curPage, leftX, rightX, curY, borderW, black);
    }

    if (block.kind === "meta") {
      drawMetaContents(curPage, curY);
      drawHBorder(curPage, leftX, rightX, curY - block.effH, borderW, black);
      curY -= block.effH;
      pageHasRows = true;
    } else if (block.kind === "descHeading") {
      drawCenteredText(
        curPage,
        "DESCRIPTION",
        leftX,
        rightX,
        curY - block.effH / 2 - 5,
        15.5,
        fontBold,
        black
      );
      drawHBorder(curPage, leftX, rightX, curY - block.effH, borderW, black);
      curY -= block.effH;
      pageHasRows = true;
    } else if (block.kind === "desc") {
      if (pageSplitTopY === null) pageSplitTopY = curY;
      drawLabelInLeftCol(curPage, block.row.label, curY, block.effH);
      drawDescValueLines(curPage, block.row, curY);
      drawHBorder(curPage, leftX, rightX, curY - block.effH, borderW, black);
      curY -= block.effH;
      pageSplitBottomY = curY;
      pageHasRows = true;
    } else if (block.kind === "occHeader") {
      if (pageSplitTopY === null) pageSplitTopY = curY;
      if (pageOccTopY === null) pageOccTopY = curY;
      drawOccHeaderRow(curPage, curY, block.effH);
      curY -= block.effH;
      pageSplitBottomY = curY;
      pageOccBottomY = curY;
      pageHasRows = true;
      occHeaderDrawnYet = true;
    } else if (block.kind === "occ") {
      if (pageSplitTopY === null) pageSplitTopY = curY;
      if (pageOccTopY === null) pageOccTopY = curY;
      drawLabelInLeftCol(curPage, block.row.label, curY, block.effH);
      drawOccRowCells(curPage, block.row, curY);
      drawHBorder(curPage, leftX, rightX, curY - block.effH, borderW, black);
      curY -= block.effH;
      pageSplitBottomY = curY;
      pageOccBottomY = curY;
      pageHasRows = true;
    } else if (block.kind === "remark") {
      if (pageSplitTopY === null) pageSplitTopY = curY;
      drawLabelInLeftCol(curPage, "Remark", curY, block.effH);
      drawRemarkLines(curPage, curY);
      drawHBorder(curPage, leftX, rightX, curY - block.effH, borderW, black);
      curY -= block.effH;
      pageSplitBottomY = curY;
      pageHasRows = true;
    }
  }

  closeVerticalBordersOnPage();

  if (curY - footerNeededH >= 20) {
    drawOneTimeJobFooter(curPage, curY, layout, fonts, gpayStr);
  } else {
    await startContinuationPage();
    drawOneTimeJobFooter(curPage, curY - 10, layout, fonts, gpayStr);
  }

  return pdfDoc;
}

// ============================================================
// 6. ATT QUOTATION PDF GENERATOR (`att-quotation`)
// ============================================================

function drawAttClosingBlock(page, topY, layout, fonts) {
  const black = rgb(0, 0, 0);
  const { bold: fontBold, serifRegular, serifBold } = fonts;
  const origTrBottom = layout.treatmentsTable.bodyBottomY;
  const leftMarginX = layout.scopeTable.leftX;
  const maxTextX = layout.scopeTable.rightX;

  const gstBulletY = topY - (origTrBottom - 292.73);
  page.drawText("\u2022", {
    x: leftMarginX,
    y: gstBulletY,
    size: 9.5,
    font: serifRegular,
    color: black,
  });
  page.drawText(
    "The above quote is exclusive of GST and will be charged as per applicable rate.",
    {
      x: leftMarginX + 12,
      y: gstBulletY,
      size: 9,
      font: serifRegular,
      color: black,
    }
  );

  const warrantyStartY = gstBulletY - 15;
  const warrantyText =
    "In case of subterranean or ground dwelling of termite infestation during the warranty period, We undertake to treat the same and eradicate the termite infestation without any extra coast to you. This warranty will be forwarded on stamp paper.";
  const warrantyLines = wrapTextByFontMetrics(
    warrantyText,
    maxTextX - leftMarginX,
    fontBold,
    10.2
  );
  warrantyLines.forEach((line, idx) => {
    page.drawText(line, {
      x: leftMarginX,
      y: warrantyStartY - idx * 14,
      size: 10.2,
      font: fontBold,
      color: black,
    });
  });

  const trustY =
    warrantyStartY - Math.max(1, warrantyLines.length) * 14 - 4;
  const trustText =
    "We trust that our proposed solution is acceptable to you and we await your favourable reply. Thank you for your interest in Samarth Pest Management.";
  const trustLines = wrapTextByFontMetrics(
    trustText,
    maxTextX - (leftMarginX + 2),
    serifRegular,
    8.5
  );
  trustLines.forEach((line, idx) => {
    page.drawText(line, {
      x: leftMarginX + 2,
      y: trustY - idx * 11.5,
      size: 8.5,
      font: serifRegular,
      color: black,
    });
  });

  const faithfulY =
    trustY - Math.max(1, trustLines.length) * 11.5 - 8;
  page.drawText("Yours faithfully,", {
    x: 56.4,
    y: faithfulY,
    size: 8.5,
    font: serifRegular,
    color: black,
  });

  const stampBox = layout.footer?.stampImage;
  const stampTargetY = faithfulY - 25.1;
  if (stampBox) {
    drawExistingPageImageXObject(page, stampBox, stampBox.x0, stampTargetY);
  }

  const sigY = stampTargetY - 9;
  page.drawText("For ", {
    x: leftMarginX,
    y: sigY,
    size: 7.5,
    font: serifRegular,
    color: black,
  });
  page.drawText("Samarth Pest Management", {
    x: leftMarginX + 13,
    y: sigY,
    size: 9.5,
    font: serifBold,
    color: black,
  });
}

export async function generateAttQuotationPdf(
  pdfDoc,
  data,
  inspection = null,
  templateBytes = null
) {
  const pages = pdfDoc.getPages();
  if (pages.length === 0) throw new Error("PDF template has no pages");

  const resolvedInspection =
    inspection ||
    (templateBytes ? await inspectPdfTemplate(templateBytes) : null) ||
    (await inspectPdfTemplate(await pdfDoc.save()));
  const layout = resolveAttQuotationPdfLayout(resolvedInspection);

  const cleanSourceBytes = templateBytes || (await pdfDoc.save());
  const page1 = pages[0];
  const { pageWidth, pageHeight, borderW } = layout;

  const fonts = await selectDocumentFonts(pdfDoc, layout.fontFamily);
  const { regular: fontRegular, bold: fontBold, serifRegular } = fonts;

  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);
  const greenBg = rgb(0.569, 0.812, 0.314);
  const blueBg = rgb(0.737, 0.839, 0.929);

  const scopeLeftX = layout.scopeTable.leftX;
  const scopeSplitX = layout.scopeTable.splitX;
  const scopeRightX = layout.scopeTable.rightX;
  const trCols = layout.treatmentsTable.cols;

  // 1. Right-side DATE & QTN NO (auto-widen left so long values never clip)
  const qDate = sanitizePdfText(data.quotationDate || "");
  const qNum = sanitizePdfText(data.quotationNumber || "");
  const dateStr = `DATE: ${qDate}`;
  const qtnStr = `QTN: ${qNum}`;
  const metaFontSize = 10.5;
  const maxMetaW = Math.max(
    fontBold.widthOfTextAtSize(dateStr, metaFontSize),
    fontBold.widthOfTextAtSize(qtnStr, metaFontSize)
  );
  const rightSafeEdge = pageWidth - 26;
  const metaX = Math.max(
    350,
    Math.min(layout.meta.dateX, rightSafeEdge - maxMetaW)
  );
  page1.drawRectangle({
    x: metaX - 4,
    y: layout.meta.qtnY - 5,
    width: pageWidth - 18 - (metaX - 4),
    height: layout.meta.dateY - layout.meta.qtnY + 20,
    color: white,
  });
  page1.drawText(dateStr, {
    x: metaX,
    y: layout.meta.dateY,
    size: metaFontSize,
    font: fontBold,
    color: black,
  });
  page1.drawText(qtnStr, {
    x: metaX,
    y: layout.meta.qtnY,
    size: metaFontSize,
    font: fontBold,
    color: black,
  });

  // 2. Customer Name, Address & Subject
  const cName = sanitizePdfText(
    data.customerName || data.customerCompanyName || ""
  );
  const cAddr = sanitizePdfText(data.customerAddress || "");
  const custX = layout.meta.customerX;
  const custMaxX = scopeRightX - 4;
  const nameFontSize = 10.5;
  const addrFontSize = 10;
  const nameLineSpacing = 13.5;
  const addrLineSpacing = 13;

  const nameLines = cName
    ? wrapTextByFontMetrics(cName, custMaxX - custX, fontBold, nameFontSize)
    : [""];
  const addrLines = cAddr
    ? wrapTextByFontMetrics(cAddr, custMaxX - custX, fontBold, addrFontSize)
    : [];

  const nameBottomY =
    layout.meta.customerNameY - (Math.max(1, nameLines.length) - 1) * nameLineSpacing;
  const addrStartY = Math.min(
    layout.meta.customerAddressY,
    nameBottomY - 14.5
  );
  const addrBottomY =
    addrLines.length > 0
      ? addrStartY - (addrLines.length - 1) * addrLineSpacing
      : nameBottomY;

  const subjectVal = sanitizePdfText(
    data.subject || "Anti Termite Pre-construction Treatment at your site."
  );
  const subjectX = layout.meta.subjectX;
  const subjectMaxX = scopeRightX - 2;
  const subjectSize = 10.5;
  const subjectLineSpacing = 13.5;
  const subjectLabel = "Subject : ";
  const subjectValStartX =
    subjectX + fontBold.widthOfTextAtSize(subjectLabel, subjectSize) + 4;
  const subjectLines = wrapTextByFontMetrics(
    subjectVal,
    Math.max(40, subjectMaxX - subjectValStartX),
    fontBold,
    subjectSize
  );
  const subjectStartY = Math.min(layout.meta.subjectY, addrBottomY - 20);
  const subjectBottomY =
    subjectStartY - (Math.max(1, subjectLines.length) - 1) * subjectLineSpacing;

  const headerPushed = subjectBottomY < layout.meta.respectedY + 14;

  // Measure Scope Table rows
  const scopeValX = scopeSplitX + 6;
  const scopeValMaxX = scopeRightX - 6;
  const scopeAvailW = Math.max(40, scopeValMaxX - scopeValX);

  const scopeSpecs = [
    {
      key: "premise",
      labelLines: ["Premise To", "Be Treated"],
      value: sanitizePdfText(data.premises || data.premiseToBeTreated || cAddr),
      valFont: fontBold,
      fontSize: 10,
      lineSpacing: 13,
    },
    {
      key: "specification",
      labelLines: ["Specification"],
      value: sanitizePdfText(
        data.specification ||
          "Providing Material and Labour For Injecting Chemical Emulsion For Pre-Constructional Anti Termite Treatment."
      ),
      valFont: fontRegular,
      fontSize: 10,
      lineSpacing: 13,
    },
    {
      key: "equipment",
      labelLines: ["Equipment"],
      value: sanitizePdfText(
        data.equipment ||
          "Sprayers & Sprinklers Will Be Used To Ensure Proper Penetration Of Chemicals Into the Earth."
      ),
      valFont: fontRegular,
      fontSize: 10,
      lineSpacing: 13,
    },
    {
      key: "paymentTerms",
      labelLines: ["Payment Terms"],
      value: sanitizePdfText(
        data.paymentTerm ||
          data.paymentTerms ||
          "Within 10 Days From The Date Of Submission Of invoice"
      ),
      valFont: fontRegular,
      fontSize: 10,
      lineSpacing: 13,
    },
  ].map((spec) => {
    const tplRow = layout.scopeTable.rows[spec.key];
    const origH = tplRow.topY - tplRow.bottomY;
    const lines = wrapTextByFontMetrics(
      spec.value,
      scopeAvailW,
      spec.valFont,
      spec.fontSize
    );
    const fitsOriginal =
      (origH >= 32 && lines.length <= 2) || (origH >= 20 && lines.length <= 1);
    const effH = fitsOriginal
      ? origH
      : Math.max(origH, lines.length * spec.lineSpacing + 12);
    return {
      ...spec,
      tplRow,
      origH,
      effH,
      lines,
    };
  });

  // Measure Treatments Table rows
  const rawTreatments =
    Array.isArray(data.treatments) && data.treatments.length > 0
      ? data.treatments
      : [
          {
            typeOfTreatment: "Anti Termite Pre-construction Treatment",
            warrantyPeriod: "10 Years",
            chemicalUsed: "Imidacloprid 30.5 % SC of m/s Bayer (Envu)",
            serviceCharges: data.totalAmount || "As per measurement",
          },
        ];

  const trFontSize = 9.5;
  const trLineSpacing = 12.5;
  const origTrBodyH =
    layout.treatmentsTable.headerBottomY - layout.treatmentsTable.bodyBottomY;

  const trRows = rawTreatments.map((t) => {
    const tType = sanitizePdfText(
      t.typeOfTreatment || "Anti Termite Pre-construction Treatment"
    );
    const tWarranty = sanitizePdfText(t.warrantyPeriod || "10 Years");
    const tChem = sanitizePdfText(t.chemicalUsed || "Imidacloprid 30.5 % SC");
    const tCharges = sanitizePdfText(t.serviceCharges || "As agreed");

    const typeLines = wrapTextByFontMetrics(
      tType,
      trCols[1] - trCols[0] - 11,
      fontBold,
      trFontSize
    );
    const warrantyLines = wrapTextByFontMetrics(
      tWarranty,
      trCols[2] - trCols[1] - 10,
      fontBold,
      trFontSize
    );
    const chemLines = wrapTextByFontMetrics(
      tChem,
      trCols[3] - trCols[2] - 11,
      fontRegular,
      trFontSize
    );
    const chargeLines = wrapTextByFontMetrics(
      tCharges,
      trCols[4] - trCols[3] - 10,
      fontBold,
      trFontSize
    );

    const maxLines = Math.max(
      1,
      typeLines.length,
      warrantyLines.length,
      chemLines.length,
      chargeLines.length
    );
    const minRowH = rawTreatments.length === 1 ? Math.max(36, origTrBodyH) : 32;
    const effH = Math.max(minRowH, maxLines * trLineSpacing + 14);
    return {
      effH,
      typeLines,
      warrantyLines,
      chemLines,
      chargeLines,
    };
  });

  const drawScopeValueLines = (page, row, topY) => {
    if (!row.lines.some(Boolean)) return;
    const blockH = row.lines.length * row.lineSpacing;
    const firstBaseY =
      topY - Math.max(12.5, (row.effH - blockH) / 2 + row.fontSize * 0.85);
    row.lines.forEach((line, idx) => {
      if (!line) return;
      page.drawText(line, {
        x: scopeValX,
        y: firstBaseY - idx * row.lineSpacing,
        size: row.fontSize,
        font: row.valFont,
        color: black,
      });
    });
  };

  const drawTreatmentRow = (page, row, topY, drawTopBorder = false) => {
    const bottomY = topY - row.effH;
    page.drawRectangle({
      x: trCols[0],
      y: bottomY,
      width: trCols[4] - trCols[0],
      height: row.effH,
      color: blueBg,
    });

    const drawColLinesCentered = (lines, x0, x1, font) => {
      const h = lines.length * trLineSpacing;
      const startY = topY - Math.max(12, (row.effH - h) / 2 + trFontSize * 0.85);
      lines.forEach((line, idx) => {
        if (!line) return;
        drawCenteredText(
          page,
          line,
          x0,
          x1,
          startY - idx * trLineSpacing,
          trFontSize,
          font,
          black
        );
      });
    };

    const typeBlockH = row.typeLines.length * trLineSpacing;
    const typeStartY =
      topY - Math.max(12, (row.effH - typeBlockH) / 2 + trFontSize * 0.85);
    row.typeLines.forEach((line, idx) => {
      if (!line) return;
      page.drawText(line, {
        x: trCols[0] + 5.5,
        y: typeStartY - idx * trLineSpacing,
        size: trFontSize,
        font: fontBold,
        color: black,
      });
    });

    drawColLinesCentered(row.warrantyLines, trCols[1], trCols[2], fontBold);
    drawColLinesCentered(row.chemLines, trCols[2], trCols[3], fontRegular);
    drawColLinesCentered(row.chargeLines, trCols[3], trCols[4], fontBold);

    if (drawTopBorder) {
      drawHBorder(page, trCols[0], trCols[4], topY, borderW, black);
    }
    drawHBorder(page, trCols[0], trCols[4], bottomY, borderW, black);
    trCols.forEach((cx) => drawVBorder(page, cx, bottomY, topY, borderW, black));
  };

  const scopeOrigTotal = scopeSpecs.reduce((s, r) => s + r.origH, 0);
  const scopeEffTotal = scopeSpecs.reduce((s, r) => s + r.effH, 0);
  const trEffTotal = trRows.reduce((s, r) => s + r.effH, 0);

  // Fast intact-template path when customer/subject, scope, and treatments all fit template boxes
  if (
    !headerPushed &&
    Math.abs(scopeEffTotal - scopeOrigTotal) <= 0.5 &&
    trEffTotal <= origTrBodyH + 0.5
  ) {
    // Customer Name & Address
    page1.drawRectangle({
      x: custX - 3,
      y: Math.min(layout.meta.customerAddressY - 6, addrBottomY - 4),
      width: metaX - custX - 6,
      height:
        layout.meta.customerNameY + 14 -
        Math.min(layout.meta.customerAddressY - 6, addrBottomY - 4),
      color: white,
    });
    nameLines.forEach((line, idx) => {
      if (line) {
        page1.drawText(line, {
          x: custX,
          y: layout.meta.customerNameY - idx * nameLineSpacing,
          size: nameFontSize,
          font: fontBold,
          color: black,
        });
      }
    });
    addrLines.forEach((line, idx) => {
      if (line) {
        page1.drawText(line, {
          x: custX,
          y: addrStartY - idx * addrLineSpacing,
          size: addrFontSize,
          font: fontBold,
          color: black,
        });
      }
    });

    // Subject with hanging indentation
    page1.drawRectangle({
      x: subjectX - 4,
      y: subjectBottomY - 4,
      width: scopeRightX - subjectX + 8,
      height: subjectStartY + 14 - (subjectBottomY - 4),
      color: white,
    });
    drawLabeledWrappedField(page1, {
      label: subjectLabel,
      value: subjectVal,
      x: subjectX,
      y: subjectStartY,
      maxX: subjectMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: subjectSize,
      lineSpacing: subjectLineSpacing,
      labelGap: 4,
    });

    // Scope right cells (keep green labels & borders untouched)
    for (const row of scopeSpecs) {
      maskCellInterior(
        page1,
        scopeSplitX,
        row.tplRow.bottomY,
        scopeRightX,
        row.tplRow.topY,
        blueBg,
        1.2
      );
      drawScopeValueLines(page1, row, row.tplRow.topY);
    }

    // Treatments body cells (preserve header & bottom warranty/closing/stamp untouched)
    const bodyTop = layout.treatmentsTable.headerBottomY;
    const bodyBot = layout.treatmentsTable.bodyBottomY;
    page1.drawRectangle({
      x: trCols[0] + 0.5,
      y: bodyBot + 0.5,
      width: trCols[4] - trCols[0] - 1,
      height: bodyTop - bodyBot - 1,
      color: blueBg,
    });
    let tCurY = bodyTop;
    const scaleRatio =
      trRows.length > 1 && trEffTotal > 0 ? (bodyTop - bodyBot) / trEffTotal : 1;
    trRows.forEach((row, idx) => {
      const scaledRow =
        trRows.length === 1
          ? { ...row, effH: bodyTop - bodyBot }
          : { ...row, effH: row.effH * scaleRatio };
      drawTreatmentRow(page1, scaledRow, tCurY, false);
      tCurY -= scaledRow.effH;
    });

    return pdfDoc;
  }

  // Full Dynamic Flow + Multi-Page Continuation Path
  const cleanSrcDoc = await PDFDocument.load(cleanSourceBytes);
  const coverFloorY = 14;
  const pageBottomMargin = 30;
  const contTopY = (layout.headerBannerBottomY || 700.6) - 36;
  const closingNeededH = 132;

  const drawCustomerSubjectIntro = () => {
    page1.drawRectangle({
      x: scopeLeftX - 4,
      y: coverFloorY,
      width: pageWidth - (scopeLeftX - 4) - 18,
      height: layout.meta.customerNameY + 14 - coverFloorY,
      color: white,
    });

    nameLines.forEach((line, idx) => {
      if (line) {
        page1.drawText(line, {
          x: custX,
          y: layout.meta.customerNameY - idx * nameLineSpacing,
          size: nameFontSize,
          font: fontBold,
          color: black,
        });
      }
    });
    addrLines.forEach((line, idx) => {
      if (line) {
        page1.drawText(line, {
          x: custX,
          y: addrStartY - idx * addrLineSpacing,
          size: addrFontSize,
          font: fontBold,
          color: black,
        });
      }
    });

    drawLabeledWrappedField(page1, {
      label: subjectLabel,
      value: subjectVal,
      x: subjectX,
      y: subjectStartY,
      maxX: subjectMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: subjectSize,
      lineSpacing: subjectLineSpacing,
      labelGap: 4,
    });

    const respY = subjectBottomY - 24;
    page1.drawText("Respected Sir,", {
      x: scopeLeftX,
      y: respY,
      size: 10.5,
      font: fontBold,
      color: black,
    });

    const introText =
      "We thank you very much for your enquiry and the opportunity given to us to quote our rates. Further to your instructions, we are pleased to submit our quotation as below. It is our commitment to provide you with the best and reliable services.";
    const introLines = wrapTextByFontMetrics(
      introText,
      scopeRightX - scopeLeftX - 10,
      serifRegular,
      10.8
    );
    const introStartY = respY - 14;
    introLines.forEach((line, idx) => {
      page1.drawText(line, {
        x: idx === 0 ? scopeLeftX + 9 : scopeLeftX + 6.5,
        y: introStartY - idx * 13,
        size: 10.8,
        font: serifRegular,
        color: black,
      });
    });

    return introStartY - introLines.length * 13 - 8;
  };

  let curY;
  if (headerPushed) {
    curY = drawCustomerSubjectIntro();
  } else {
    // Keep "Respected Sir," & intro untouched; redraw Subject + Customer cleanly, cover from Scope top downward
    page1.drawRectangle({
      x: custX - 3,
      y: Math.min(layout.meta.customerAddressY - 6, addrBottomY - 4),
      width: metaX - custX - 6,
      height:
        layout.meta.customerNameY + 14 -
        Math.min(layout.meta.customerAddressY - 6, addrBottomY - 4),
      color: white,
    });
    nameLines.forEach((line, idx) => {
      if (line) {
        page1.drawText(line, {
          x: custX,
          y: layout.meta.customerNameY - idx * nameLineSpacing,
          size: nameFontSize,
          font: fontBold,
          color: black,
        });
      }
    });
    addrLines.forEach((line, idx) => {
      if (line) {
        page1.drawText(line, {
          x: custX,
          y: addrStartY - idx * addrLineSpacing,
          size: addrFontSize,
          font: fontBold,
          color: black,
        });
      }
    });

    page1.drawRectangle({
      x: subjectX - 4,
      y: subjectBottomY - 4,
      width: scopeRightX - subjectX + 8,
      height: subjectStartY + 14 - (subjectBottomY - 4),
      color: white,
    });
    drawLabeledWrappedField(page1, {
      label: subjectLabel,
      value: subjectVal,
      x: subjectX,
      y: subjectStartY,
      maxX: subjectMaxX,
      fontRegular: fontBold,
      fontBold,
      fontSize: subjectSize,
      lineSpacing: subjectLineSpacing,
      labelGap: 4,
    });

    const scopeTop = layout.scopeTable.rows.premise.topY;
    page1.drawRectangle({
      x: 0,
      y: coverFloorY,
      width: pageWidth,
      height: scopeTop + 1 - coverFloorY,
      color: white,
    });
    curY = scopeTop;
  }

  let curPage = page1;
  let pageHasContent = false;

  const startAttContPage = async () => {
    const [contPage] = await pdfDoc.copyPages(cleanSrcDoc, [0]);
    pdfDoc.addPage(contPage);
    const maskTop = (layout.headerBannerBottomY || 700.6) - 1.5;
    contPage.drawRectangle({
      x: 0,
      y: coverFloorY,
      width: pageWidth,
      height: maskTop - coverFloorY,
      color: white,
    });
    drawCenteredText(
      contPage,
      "ATT QUOTATION (Continued)",
      scopeLeftX,
      scopeRightX,
      layout.meta.titleY,
      12.5,
      fontBold,
      black
    );
    curPage = contPage;
    curY = contTopY;
    pageHasContent = false;
  };

  // Draw Scope Table
  for (let i = 0; i < scopeSpecs.length; i++) {
    const row = scopeSpecs[i];
    if (pageHasContent && curY - row.effH < pageBottomMargin) {
      await startAttContPage();
    }
    const rowTopY = curY;
    const rowBotY = curY - row.effH;
    curPage.drawRectangle({
      x: scopeLeftX,
      y: rowBotY,
      width: scopeSplitX - scopeLeftX,
      height: row.effH,
      color: greenBg,
    });
    curPage.drawRectangle({
      x: scopeSplitX,
      y: rowBotY,
      width: scopeRightX - scopeSplitX,
      height: row.effH,
      color: blueBg,
    });

    const lblFontSize = row.key === "paymentTerms" ? 9 : 10;
    const lblSpacing = 12.5;
    const lblBlockH = row.labelLines.length * lblSpacing;
    const lblStartY =
      rowTopY - Math.max(12, (row.effH - lblBlockH) / 2 + lblFontSize * 0.85);
    row.labelLines.forEach((l, li) => {
      curPage.drawText(l, {
        x: scopeLeftX + 4.5,
        y: lblStartY - li * lblSpacing,
        size: lblFontSize,
        font: fontBold,
        color: black,
      });
    });

    drawScopeValueLines(curPage, row, rowTopY);

    if (i === 0 || !pageHasContent) {
      drawHBorder(curPage, scopeLeftX, scopeRightX, rowTopY, borderW, black);
    }
    drawHBorder(curPage, scopeLeftX, scopeRightX, rowBotY, borderW, black);
    drawVBorder(curPage, scopeLeftX, rowBotY, rowTopY, borderW, black);
    drawVBorder(curPage, scopeSplitX, rowBotY, rowTopY, borderW, black);
    drawVBorder(curPage, scopeRightX, rowBotY, rowTopY, borderW, black);

    curY = rowBotY;
    pageHasContent = true;
  }

  // Gap between Scope Table and Treatments Table
  curY -= 8;

  const trHeaderH =
    layout.treatmentsTable.headerTopY - layout.treatmentsTable.headerBottomY;
  const drawTreatmentsHeader = (page, topY) => {
    const botY = topY - trHeaderH;
    page.drawRectangle({
      x: trCols[0],
      y: botY,
      width: trCols[4] - trCols[0],
      height: trHeaderH,
      color: greenBg,
    });
    const textY = topY - trHeaderH / 2 - 3.5;
    drawCenteredText(
      page,
      "Type Of Treatment",
      trCols[0],
      trCols[1],
      textY,
      10,
      fontRegular,
      black
    );
    drawCenteredText(
      page,
      "Period of Warranty",
      trCols[1],
      trCols[2],
      textY,
      10,
      fontRegular,
      black
    );
    drawCenteredText(
      page,
      "Chemical Used",
      trCols[2],
      trCols[3],
      textY,
      10,
      fontRegular,
      black
    );
    drawCenteredText(
      page,
      "Service Charges",
      trCols[3],
      trCols[4],
      textY,
      10,
      fontRegular,
      black
    );
    drawHBorder(page, trCols[0], trCols[4], topY, borderW, black);
    drawHBorder(page, trCols[0], trCols[4], botY, borderW, black);
    trCols.forEach((cx) => drawVBorder(page, cx, botY, topY, borderW, black));
    return botY;
  };

  if (curY - (trHeaderH + trRows[0].effH) < pageBottomMargin) {
    await startAttContPage();
  }
  curY = drawTreatmentsHeader(curPage, curY);

  for (const row of trRows) {
    if (curY - row.effH < pageBottomMargin) {
      await startAttContPage();
      curY = drawTreatmentsHeader(curPage, curY);
    }
    drawTreatmentRow(curPage, row, curY, false);
    curY -= row.effH;
    pageHasContent = true;
  }

  // Closing warranty + stamp block
  if (curY - closingNeededH >= 18) {
    drawAttClosingBlock(curPage, curY, layout, fonts);
  } else {
    await startAttContPage();
    drawAttClosingBlock(curPage, curY, layout, fonts);
  }

  return pdfDoc;
}

// ============================================================
// MAIN DISPATCHER
// ============================================================

/**
 * Generates a completed PDF from any category's PDF template.
 * Routes to category-specific generator based on documentType:
 * - 'quotation': PC Quotation
 * - 'tax-invoice': GST Tax Invoice
 * - 'invoice': Non-GST Invoice
 * - 'contract-renewal': Contract Renewal
 * - 'one-time-job': One Time Job Service Paper
 * - 'att-quotation': ATT Quotation
 */
export const generatePdfFromPdfTemplate = async (
  templatePath,
  documentData = {},
  documentType = "quotation"
) => {
  try {
    if (!fs.existsSync(templatePath)) {
      throw new Error(`PDF template file not found on server: ${templatePath}`);
    }

    const templateBytes = fs.readFileSync(templatePath);
    const inspection = await inspectPdfTemplate(templateBytes);
    const pdfDoc = await PDFDocument.load(templateBytes);

    if (pdfDoc.getPageCount() === 0) {
      throw new PdfTemplateValidationError("PDF template has no pages");
    }

    const docType = String(
      documentType ||
      documentData.documentType ||
      (documentData.quotationType === "ATT" ? "att-quotation" : "") ||
      "quotation"
    ).toLowerCase();

    switch (docType) {
      case "tax-invoice":
        await generateTaxInvoicePdf(pdfDoc, documentData, inspection, templateBytes);
        break;

      case "invoice":
        await generateNonGstInvoicePdf(pdfDoc, documentData, inspection, templateBytes);
        break;

      case "att-quotation":
        await generateAttQuotationPdf(pdfDoc, documentData, inspection, templateBytes);
        break;

      case "contract-renewal":
        await generateContractRenewalPdf(pdfDoc, documentData, inspection, templateBytes);
        break;

      case "one-time-job":
        await generateOneTimeJobPdf(pdfDoc, documentData, inspection, templateBytes);
        break;

      case "quotation":
      default:
        await generateQuotationPdf(pdfDoc, documentData, inspection, templateBytes);
        break;
    }

    const savedBytes = await pdfDoc.save();
    return Buffer.from(savedBytes);
  } catch (error) {
    console.error(`PDF template generation error for '${documentType}':`, error);
    throw error;
  }
};
