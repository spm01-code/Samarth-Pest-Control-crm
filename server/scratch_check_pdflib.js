try {
  const pdfLib = await import("pdf-lib");
  console.log("pdf-lib available:", Boolean(pdfLib));
} catch (err) {
  console.log("pdf-lib NOT available:", err.message);
}
