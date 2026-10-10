import templateUpload from "../middleware/templateUpload.js";

console.log("=== TESTING MULTER DUAL FILE FILTER ===");

const createFakeReqFile = (originalname, mimetype) => ({
  file: { originalname, mimetype }
});

const runFilterTest = (filename, mimetype) => {
  return new Promise((resolve) => {
    const fakeFile = { originalname: filename, mimetype };
    templateUpload.single("template")({ file: fakeFile }, {}, (err) => {
      if (err) {
        resolve({ allowed: false, error: err.message });
      } else {
        resolve({ allowed: true, error: null });
      }
    });
  });
};

async function testAll() {
  const testCases = [
    { filename: "test_template.docx", mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", expected: true },
    { filename: "test_template.pdf", mimetype: "application/pdf", expected: true },
    { filename: "test_template.pdf", mimetype: "application/x-pdf", expected: true },
    { filename: "test_script.exe", mimetype: "application/x-msdownload", expected: false },
    { filename: "test_document.txt", mimetype: "text/plain", expected: false },
    { filename: "malicious.docx.exe", mimetype: "application/x-msdownload", expected: false },
  ];

  for (const tc of testCases) {
    // Manually trigger fileFilter function from templateUpload
    const fakeFile = { originalname: tc.filename, mimetype: tc.mimetype };
    let result = { allowed: false, error: null };
    
    // Call raw fileFilter logic directly
    const dummyCb = (err, pass) => {
      if (err) result = { allowed: false, error: err.message };
      else if (pass) result = { allowed: true, error: null };
    };

    // Access fileFilter from templateUpload
    // @ts-ignore
    const fileFilterFn = templateUpload.fileFilter || ((req, file, cb) => cb(null, true));
    fileFilterFn({}, fakeFile, dummyCb);

    const statusStr = result.allowed === tc.expected ? "PASSED" : "FAILED";
    console.log(`- File: '${tc.filename}' (${tc.mimetype}) -> Allowed: ${result.allowed} (${statusStr}) ${result.error ? '[' + result.error + ']' : ''}`);
  }
}

testAll().catch(console.error);
