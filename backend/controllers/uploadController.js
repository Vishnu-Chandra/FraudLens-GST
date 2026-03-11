const fs = require("fs");
const csv = require("csv-parser");

const Invoice = require("../models/Invoice");
const GSTR1 = require("../models/GSTR1");
const GSTR3B = require("../models/GSTR3B");
const EWayBill = require("../models/EWayBill");

async function parseCSV(filePath) {
  return new Promise((resolve) => {
    const results = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results));
  });
}

exports.uploadInvoices = async (req, res) => {
  const data = await parseCSV(req.file.path);
  await Invoice.insertMany(data);
  res.json({ message: "Invoices uploaded", count: data.length });
};

exports.uploadGSTR1 = async (req, res) => {
  const data = await parseCSV(req.file.path);
  await GSTR1.insertMany(data);
  res.json({ message: "GSTR1 uploaded", count: data.length });
};

exports.uploadGSTR3B = async (req, res) => {
  const data = await parseCSV(req.file.path);
  await GSTR3B.insertMany(data);
  res.json({ message: "GSTR3B uploaded", count: data.length });
};

exports.uploadEWayBills = async (req, res) => {
  const data = await parseCSV(req.file.path);
  await EWayBill.insertMany(data);
  res.json({ message: "EWay Bills uploaded", count: data.length });
};