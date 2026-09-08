import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDirectory = path.resolve(
  process.cwd(),
  "uploads",
  "templates"
);

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${path.extname(file.originalname)}`;

    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  const isDocx =
    extension === ".docx" &&
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (!isDocx) {
    return cb(
      new Error("Only .docx files are allowed")
    );
  }

  cb(null, true);
};

const templateUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

export default templateUpload;