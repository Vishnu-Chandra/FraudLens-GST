const mongoose = require('mongoose');

const TaxReturnSchema = new mongoose.Schema(
    {
        gstin: {
            type: String,
            required: true,
        },
        returnType: {
            type: String,
            enum: ['GSTR1', 'GSTR2A', 'GSTR3B', 'GSTR9'],
            required: true,
        },
        filingPeriod: {
            month: { type: Number, min: 1, max: 12 },
            year: { type: Number },
            quarter: { type: Number, min: 1, max: 4 },
        },
        filingDate: {
            type: Date,
        },
        dueDate: {
            type: Date,
        },
        isLate: {
            type: Boolean,
            default: false,
        },
        totalTaxableValue: {
            type: Number,
            default: 0,
        },
        totalTaxPaid: {
            type: Number,
            default: 0,
        },
        totalIGST: {
            type: Number,
            default: 0,
        },
        totalCGST: {
            type: Number,
            default: 0,
        },
        totalSGST: {
            type: Number,
            default: 0,
        },
        itcClaimed: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ['filed', 'pending', 'overdue'],
            default: 'pending',
        },
        anomalyFlags: [
            {
                type: { type: String },
                description: { type: String },
                severity: { type: String, enum: ['low', 'medium', 'high'] },
            },
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model('TaxReturn', TaxReturnSchema);
