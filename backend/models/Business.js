const mongoose = require('mongoose');

const BusinessSchema = new mongoose.Schema(
    {
        gstin: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        pan: {
            type: String,
            trim: true,
        },
        address: {
            type: String,
        },
        state: {
            type: String,
        },
        businessType: {
            type: String,
            enum: ['manufacturer', 'trader', 'service_provider', 'exporter', 'other'],
            default: 'other',
        },
        registrationDate: {
            type: Date,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        riskScore: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        riskCategory: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'low',
        },
        // Transaction data for fraud detection
        invoiceCount: {
            type: Number,
            default: 0,
        },
        totalTaxableValue: {
            type: Number,
            default: 0,
        },
        itcClaimed: {
            type: Number,
            default: 0,
        },
        totalTax: {
            type: Number,
            default: 0,
        },
        lateFilings: {
            type: Number,
            default: 0,
        },
        missingEwayBills: {
            type: Number,
            default: 0,
        },
        gstCollected: {
            type: Number,
            default: 0,
        },
        gstPaid: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Business', BusinessSchema);
