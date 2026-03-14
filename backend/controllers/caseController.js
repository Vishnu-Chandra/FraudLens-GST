const mongoose = require('mongoose');
const Case = require('../models/Case');
const Anomaly = require('../models/Anomaly');
const { getActiveOfficerNames } = require('../services/officerService');

const STATUS_FLOW = {
  OPEN: ['UNDER_INVESTIGATION'],
  UNDER_INVESTIGATION: ['EVIDENCE_COLLECTED'],
  EVIDENCE_COLLECTED: ['ESCALATED', 'CLOSED'],
  ESCALATED: ['CLOSED'],
  CLOSED: [],
};

function normalizeUniqueArray(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
}

async function generateCaseId() {
  const latest = await Case.findOne({}, { case_id: 1 }).sort({ created_at: -1, _id: -1 }).lean();
  let nextNumber = 1;

  if (latest?.case_id) {
    const match = String(latest.case_id).match(/CASE-(\d+)/);
    if (match) nextNumber = Number(match[1]) + 1;
  }

  return `CASE-${String(nextNumber).padStart(4, '0')}`;
}

async function createCase(req, res) {
  try {
    const {
      title,
      description = '',
      businesses = [],
      linked_anomalies = [],
      investigator,
      priority = 'MEDIUM',
      status = 'OPEN',
    } = req.body;

    if (!title || String(title).trim().length < 5) {
      return res.status(400).json({ success: false, message: 'Title must be at least 5 characters long' });
    }
    if (!investigator || !String(investigator).trim()) {
      return res.status(400).json({ success: false, message: 'Investigator is required' });
    }

    const normalizedBusinesses = normalizeUniqueArray(businesses);
    if (normalizedBusinesses.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one business GSTIN is required' });
    }

    const normalizedAnomalies = normalizeUniqueArray(linked_anomalies);

    let createdCase;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const case_id = await generateCaseId();
        createdCase = await Case.create({
          case_id,
          title: String(title).trim(),
          description: String(description || '').trim(),
          businesses: normalizedBusinesses,
          linked_anomalies: normalizedAnomalies,
          investigator: String(investigator).trim(),
          priority,
          status,
          notes: [],
        });
        break;
      } catch (error) {
        if (error?.code !== 11000 || attempt === 2) throw error;
      }
    }

    // Auto-link workflow: move linked anomalies into investigation state
    const anomalyObjectIds = normalizedAnomalies
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (anomalyObjectIds.length > 0) {
      await Anomaly.updateMany(
        { _id: { $in: anomalyObjectIds } },
        {
          $set: {
            status: 'INVESTIGATING',
            assignedTo: String(investigator).trim(),
          },
        }
      );
    }

    return res.status(201).json({ success: true, data: createdCase });
  } catch (error) {
    console.error('Error creating case:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function getInvestigators(req, res) {
  try {
    const [fromCases, fromAnomalies, fromOfficers] = await Promise.all([
      Case.distinct('investigator', { investigator: { $exists: true, $ne: '' } }),
      Anomaly.distinct('assignedTo', { assignedTo: { $exists: true, $ne: '' } }),
      getActiveOfficerNames(),
    ]);

    const users = [...new Set([...(fromCases || []), ...(fromAnomalies || []), ...(fromOfficers || [])]
      .map((x) => String(x || '').trim())
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    return res.json({ success: true, data: users });
  } catch (error) {
    console.error('Error getting investigators:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function listCases(req, res) {
  try {
    const {
      status,
      priority,
      investigator,
      page = 1,
      limit = 20,
    } = req.query;

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (investigator) query.investigator = { $regex: String(investigator), $options: 'i' };

    const [rows, total] = await Promise.all([
      Case.find(query).sort({ updated_at: -1 }).skip(skip).limit(safeLimit).lean(),
      Case.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: rows,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    });
  } catch (error) {
    console.error('Error listing cases:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function getCaseDetails(req, res) {
  try {
    const { case_id } = req.params;
    const foundCase = await Case.findOne({ case_id }).lean();

    if (!foundCase) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }

    const anomalyObjectIds = (foundCase.linked_anomalies || [])
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    let linkedAnomaliesData = [];
    if (anomalyObjectIds.length > 0) {
      linkedAnomaliesData = await Anomaly.find({ _id: { $in: anomalyObjectIds } }).lean();
    }

    return res.json({
      success: true,
      data: {
        ...foundCase,
        linkedAnomaliesData,
      },
    });
  } catch (error) {
    console.error('Error getting case details:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function updateCase(req, res) {
  try {
    const { case_id } = req.params;
    const existing = await Case.findOne({ case_id });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }

    const {
      status,
      priority,
      investigator,
      businesses,
      linked_anomalies,
      title,
      description,
    } = req.body;

    if (status && status !== existing.status) {
      const allowed = STATUS_FLOW[existing.status] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from ${existing.status} to ${status}`,
        });
      }
    }

    if (businesses && normalizeUniqueArray(businesses).length === 0) {
      return res.status(400).json({ success: false, message: 'At least one business GSTIN is required' });
    }

    const update = {};
    if (status) update.status = status;
    if (priority) update.priority = priority;
    if (investigator !== undefined) update.investigator = String(investigator || '').trim();
    if (Array.isArray(businesses)) update.businesses = normalizeUniqueArray(businesses);
    if (Array.isArray(linked_anomalies)) update.linked_anomalies = normalizeUniqueArray(linked_anomalies);
    if (title !== undefined) update.title = String(title || '').trim();
    if (description !== undefined) update.description = String(description || '').trim();

    const updated = await Case.findOneAndUpdate({ case_id }, update, {
      new: true,
      runValidators: true,
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating case:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function addCaseNote(req, res) {
  try {
    const { case_id } = req.params;
    const { author, note } = req.body;

    if (!author || !String(author).trim()) {
      return res.status(400).json({ success: false, message: 'Note author is required' });
    }
    if (!note || !String(note).trim()) {
      return res.status(400).json({ success: false, message: 'Note text is required' });
    }

    const updated = await Case.findOneAndUpdate(
      { case_id },
      {
        $push: {
          notes: {
            author: String(author).trim(),
            note: String(note).trim(),
            timestamp: new Date(),
          },
        },
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error adding case note:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function getCaseSummary(req, res) {
  try {
    const [total, open, underInvestigation, closed] = await Promise.all([
      Case.countDocuments(),
      Case.countDocuments({ status: 'OPEN' }),
      Case.countDocuments({ status: 'UNDER_INVESTIGATION' }),
      Case.countDocuments({ status: 'CLOSED' }),
    ]);

    return res.json({
      success: true,
      data: {
        total,
        open,
        underInvestigation,
        closed,
      },
    });
  } catch (error) {
    console.error('Error getting case summary:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function deleteCase(req, res) {
  try {
    const { case_id } = req.params;
    const deleted = await Case.findOneAndDelete({ case_id }).lean();

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }

    return res.json({ success: true, message: 'Case deleted successfully' });
  } catch (error) {
    console.error('Error deleting case:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  createCase,
  listCases,
  getCaseDetails,
  updateCase,
  deleteCase,
  addCaseNote,
  getCaseSummary,
  getInvestigators,
};
