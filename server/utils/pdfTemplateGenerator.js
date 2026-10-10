import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const generatePdfFromPdfTemplate = async (templatePath, quotationData) => {
  try {
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);

    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      throw new Error("PDF template has no pages");
    }

    const page1 = pages[0];
    const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const white = rgb(1, 1, 1);
    const black = rgb(0, 0, 0);
    const greenBg = rgb(132 / 255, 194 / 255, 64 / 255); // #84C240 green

    // Helper to cover area and draw text
    const coverAndDrawText = (page, text, { x, y, width, height, font, size, color, bg }) => {
      if (width && height && bg) {
        page.drawRectangle({
          x,
          y,
          width,
          height,
          color: bg,
        });
      }
      if (text !== undefined && text !== null && String(text).trim() !== "") {
        page.drawText(String(text), {
          x,
          y,
          size: size || 9.5,
          font: font || fontTimes,
          color: color || black,
        });
      }
    };

    // 1. Header Fields Overlay (Page 1)
    // Date & QTN NO block coverage: X=428 to 572, Y=698 to 726
    if (quotationData.quotationDate || quotationData.quotationNumber || quotationData.quoteNumber) {
      page1.drawRectangle({
        x: 428,
        y: 698,
        width: 144,
        height: 28,
        color: white,
      });

      if (quotationData.quotationDate) {
        page1.drawText(`DATE :${quotationData.quotationDate}`, {
          x: 435,
          y: 713,
          size: 9.5,
          font: fontTimesBold,
          color: black,
        });
      }

      const qNum = quotationData.quotationNumber || quotationData.quoteNumber;
      if (qNum) {
        page1.drawText(`QTN NO :${qNum}`, {
          x: 435,
          y: 702,
          size: 9.5,
          font: fontTimesBold,
          color: black,
        });
      }
    }

    // Customer Name: X=42, Y=680
    if (quotationData.customerName || quotationData.customerCompanyName || quotationData.customerFullName) {
      const cName = quotationData.customerName || quotationData.customerCompanyName || quotationData.customerFullName;
      coverAndDrawText(page1, cName, {
        x: 42,
        y: 680,
        width: 350,
        height: 14,
        bg: white,
        font: fontTimesBold,
        size: 10,
        color: black,
      });
    }

    // 2. Premises to be Treated Row (Green Row)
    // Template coordinates: Right cell X = 149.04 to 570.0 (Width = 420.96), Y = 396.95 to 425.99 (Height = 29.04)
    if (quotationData.premisesTreated) {
      // Cover the old template text with solid green fill (NO WHITE HIGHLIGHT BOX!)
      page1.drawRectangle({
        x: 149.5,
        y: 397.5,
        width: 420,
        height: 27.8,
        color: greenBg,
      });

      // Draw Premises text in WHITE (rgb(1,1,1)) matching Image 1
      page1.drawText(String(quotationData.premisesTreated), {
        x: 157,
        y: 407,
        size: 10,
        font: fontTimesBold,
        color: white,
      });

      // Re-draw outer rectangle and divider border lines for Premises row
      page1.drawRectangle({
        x: 18.84,
        y: 396.95,
        width: 551.16,
        height: 29.04,
        borderWidth: 0.75,
        borderColor: black,
      });
      page1.drawLine({
        start: { x: 149.04, y: 396.95 },
        end: { x: 149.04, y: 425.99 },
        thickness: 0.75,
        color: black,
      });
    }

    // 3. Commercial Proposal Table (5 Columns)
    // Column x-boundaries:
    const colX = [18.84, 77.78, 304.25, 399.43, 487.90, 570.00];

    const services = Array.isArray(quotationData.services) ? quotationData.services : [];
    let currentY = 361.61; // Service rows start below header (Y=361.61)

    const serviceRowDetails = [];

    services.forEach((service, index) => {
      const numStr = String(index + 1);
      const location = service.location || service.address || quotationData.premisesTreated || "";
      const name = service.serviceName || service.name || "";
      const freq = service.frequency || "";
      const cost = service.amount !== undefined ? String(service.amount) : (service.cost !== undefined ? String(service.cost) : "0.00");

      // Text wrapping calculations
      const locLines = wrapText(location, 42);
      const nameLines = wrapText(name, 18);
      const maxLines = Math.max(locLines.length, nameLines.length, 1);
      const rowHeight = Math.max(26, maxLines * 12 + 10);
      const rowTopY = currentY;
      const rowBottomY = currentY - rowHeight;

      serviceRowDetails.push({
        numStr,
        location,
        name,
        freq,
        cost,
        locLines,
        nameLines,
        rowTopY,
        rowBottomY,
        rowHeight,
      });

      currentY = rowBottomY;
    });

    const totalRowTopY = currentY;
    const totalRowHeight = 26.52;
    const totalRowBottomY = totalRowTopY - totalRowHeight;

    // Clear entire table body area from header bottom (361.61) down to totalRowBottomY with white fill
    const tableBodyHeight = 361.61 - totalRowBottomY;
    page1.drawRectangle({
      x: 18.0,
      y: totalRowBottomY,
      width: 553.0,
      height: tableBodyHeight,
      color: white,
    });

    // Draw Content for each service row
    serviceRowDetails.forEach((row) => {
      const { numStr, freq, cost, locLines, nameLines, rowTopY, rowBottomY, rowHeight } = row;

      // Col 1: Service Number (Centered horizontally and vertically)
      const numWidth = fontTimesBold.widthOfTextAtSize(numStr, 10);
      const col1CenterX = (colX[0] + colX[1]) / 2;
      const numX = col1CenterX - numWidth / 2;
      const numY = rowTopY - rowHeight / 2 - 3;
      page1.drawText(numStr, {
        x: numX,
        y: numY,
        size: 10,
        font: fontTimesBold,
        color: black,
      });

      // Col 2: Location to be Treated (Left-aligned with padding)
      const locX = colX[1] + 6;
      locLines.forEach((line, lIdx) => {
        page1.drawText(line, {
          x: locX,
          y: rowTopY - 14 - lIdx * 11,
          size: 9,
          font: fontTimes,
          color: black,
        });
      });

      // Col 3: Service Name (Left-aligned with padding)
      const nameX = colX[2] + 6;
      nameLines.forEach((line, nIdx) => {
        page1.drawText(line, {
          x: nameX,
          y: rowTopY - 14 - nIdx * 11,
          size: 9,
          font: fontTimes,
          color: black,
        });
      });

      // Col 4: Frequency (Centered horizontally)
      const freqWidth = fontTimes.widthOfTextAtSize(freq, 9);
      const col4CenterX = (colX[3] + colX[4]) / 2;
      const freqX = col4CenterX - freqWidth / 2;
      page1.drawText(freq, {
        x: freqX,
        y: rowTopY - 14,
        size: 9,
        font: fontTimes,
        color: black,
      });

      // Col 5: Service Cost (Left-aligned with padding)
      const costX = colX[4] + 6;
      page1.drawText(cost, {
        x: costX,
        y: rowTopY - 14,
        size: 9,
        font: fontTimes,
        color: black,
      });
    });

    // 4. TOTAL AMOUNT Row Content
    const totalAmountStr = quotationData.totalAmount || quotationData.grandTotal || quotationData.total || "0.00";
    
    // TOTAL AMOUNT label (Right-aligned inside merged cell [colX[0], colX[4]])
    const labelText = "TOTAL AMOUNT";
    const labelWidth = fontTimesBold.widthOfTextAtSize(labelText, 10.5);
    const labelX = colX[4] - 25 - labelWidth;
    const labelY = totalRowTopY - totalRowHeight / 2 - 3;

    page1.drawText(labelText, {
      x: labelX,
      y: labelY,
      size: 10.5,
      font: fontTimesBold,
      color: black,
    });

    // Total Amount value (Left-aligned inside Column 5)
    page1.drawText(String(totalAmountStr), {
      x: colX[4] + 6,
      y: labelY,
      size: 9.5,
      font: fontTimes,
      color: black,
    });

    // 5. Draw Continuous Borders for Header, Service Rows, and Total Row
    // Header Top & Bottom lines
    page1.drawLine({ start: { x: colX[0], y: 388.13 }, end: { x: colX[5], y: 388.13 }, thickness: 0.75, color: black });
    page1.drawLine({ start: { x: colX[0], y: 361.61 }, end: { x: colX[5], y: 361.61 }, thickness: 0.75, color: black });

    // Draw horizontal bottom line for each service row
    serviceRowDetails.forEach((row) => {
      page1.drawLine({
        start: { x: colX[0], y: row.rowBottomY },
        end: { x: colX[5], y: row.rowBottomY },
        thickness: 0.75,
        color: black,
      });
    });

    // Draw vertical lines for service rows section (from Y=388.13 down to totalRowTopY)
    colX.forEach((xPos) => {
      page1.drawLine({
        start: { x: xPos, y: 388.13 },
        end: { x: xPos, y: totalRowTopY },
        thickness: 0.75,
        color: black,
      });
    });

    // TOTAL AMOUNT Row Borders
    page1.drawLine({ start: { x: colX[0], y: totalRowBottomY }, end: { x: colX[5], y: totalRowBottomY }, thickness: 0.75, color: black });
    page1.drawLine({ start: { x: colX[0], y: totalRowTopY }, end: { x: colX[0], y: totalRowBottomY }, thickness: 0.75, color: black });
    page1.drawLine({ start: { x: colX[4], y: totalRowTopY }, end: { x: colX[4], y: totalRowBottomY }, thickness: 0.75, color: black });
    page1.drawLine({ start: { x: colX[5], y: totalRowTopY }, end: { x: colX[5], y: totalRowBottomY }, thickness: 0.75, color: black });

    // 6. Dynamic Terms and Footer Section below Table
    // Position terms dynamically below totalRowBottomY
    const footerStartY = totalRowBottomY - 14;

    // Clear entire terms and signoff area below totalRowBottomY down to Y=100 with white fill
    page1.drawRectangle({
      x: 18.0,
      y: 100.0,
      width: 553.0,
      height: (totalRowBottomY - 0.5) - 100.0,
      color: white,
    });

    page1.drawText("•   The above quote is exclusive of GST and will be charged as per applicable rate.", {
      x: 28.32,
      y: footerStartY,
      size: 9.5,
      font: fontTimes,
      color: black,
    });

    const payTermStr = quotationData.paymentTerms || quotationData.paymentTerm || "Within 10 days from the date of invoice submission.";
    page1.drawText(`•   Payment Term : ${payTermStr}`, {
      x: 28.32,
      y: footerStartY - 13,
      size: 9.5,
      font: fontTimes,
      color: black,
    });

    const billTermStr = quotationData.billingTerm || quotationData.billingTerms || "Monthly";
    page1.drawText(`•   Billing Term : ${billTermStr}`, {
      x: 28.32,
      y: footerStartY - 26,
      size: 9.5,
      font: fontTimes,
      color: black,
    });

    const closingStr = "We trust that our proposed solution is acceptable to you and we await your favourable reply. Thank you for your interest in Samarth Pest Management.";
    const closingLines = wrapText(closingStr, 110);
    closingLines.forEach((line, idx) => {
      page1.drawText(line, {
        x: 28.32,
        y: footerStartY - 40 - idx * 11,
        size: 9,
        font: fontTimes,
        color: black,
      });
    });

    const signoffY = footerStartY - 65;
    page1.drawText("Yours faithful", {
      x: 28.32,
      y: signoffY,
      size: 9.5,
      font: fontTimes,
      color: black,
    });

    page1.drawText("For Samarth Pest Management", {
      x: 28.32,
      y: signoffY - 45,
      size: 9,
      font: fontTimesBold,
      color: black,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error("PDF template generation error:", error);
    throw error;
  }
};

function wrapText(text, maxChars) {
  if (!text) return [""];
  const words = String(text).split(" ");
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    if ((currentLine + " " + word).trim().length <= maxChars) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [String(text)];
}
