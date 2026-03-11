const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Models
const Business = require("./models/Business");
const Invoice = require("./models/Invoice");
const GSTR1 = require("./models/GSTR1");
const GSTR3B = require("./models/GSTR3B");
const EWayBill = require("./models/EWayBill");

const DATA_DIR = path.join(__dirname, "../data");

async function seedDatabase() {
    try {
        console.log("Connecting to MongoDB...");
        // The API connects to "gst_platform", not "gst_risk"!
        await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gst_platform");
        console.log("✅ Connected");

        // Clear existing data
        console.log("Clearing old data...");
        await Promise.all([
            Business.deleteMany({}),
            Invoice.deleteMany({}),
            GSTR1.deleteMany({}),
            GSTR3B.deleteMany({}),
            EWayBill.deleteMany({}),
        ]);
        console.log("✅ Old data cleared");

        // Load JSON files
        const businesses = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "businesses.json"), "utf8"));
        const invoices = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "invoices.json"), "utf8"));
        const gstr1 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "gstr1.json"), "utf8"));
        const gstr3b = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "gstr3b.json"), "utf8"));
        const ewaybills = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "ewaybills.json"), "utf8"));

        console.log("Importing new data...");
        await Business.insertMany(businesses);
        await Invoice.insertMany(invoices);
        await GSTR1.insertMany(gstr1);
        await GSTR3B.insertMany(gstr3b);
        await EWayBill.insertMany(ewaybills);

        console.log("✅ Import complete!");
        console.log(`- ${businesses.length} Businesses`);
        console.log(`- ${invoices.length} Invoices`);
        console.log(`- ${gstr1.length} GSTR-1 records`);
        console.log(`- ${gstr3b.length} GSTR-3B records`);
        console.log(`- ${ewaybills.length} eWay Bills`);

        process.exit(0);
    } catch (error) {
        console.error("❌ Seeding error:", error);
        process.exit(1);
    }
}

seedDatabase();
