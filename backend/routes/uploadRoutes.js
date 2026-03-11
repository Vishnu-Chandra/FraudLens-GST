const express = require("express");
const router = express.Router();
const multer = require("multer");

const uploadController = require("../controllers/uploadController");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

router.post("/invoices", upload.single("file"), uploadController.uploadInvoices);

router.post("/gstr1", upload.single("file"), uploadController.uploadGSTR1);

router.post("/gstr3b", upload.single("file"), uploadController.uploadGSTR3B);

router.post("/ewaybills", upload.single("file"), uploadController.uploadEWayBills);

module.exports = router;