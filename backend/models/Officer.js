const mongoose = require('mongoose');

const officerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    tier: {
      type: String,
      enum: ['JUNIOR', 'MID', 'SENIOR', 'EXPERT'],
      required: true,
      default: 'MID',
      index: true,
    },
    years: {
      type: Number,
      min: 0,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('Officer', officerSchema);
