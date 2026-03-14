const express = require('express');
const router = express.Router();
const {
  createCase,
  listCases,
  getCaseDetails,
  updateCase,
  deleteCase,
  addCaseNote,
  getCaseSummary,
  getInvestigators,
} = require('../controllers/caseController');

// GET /api/cases/summary
router.get('/summary', getCaseSummary);

// GET /api/cases/investigators
router.get('/investigators', getInvestigators);

// POST /api/cases
router.post('/', createCase);

// GET /api/cases
router.get('/', listCases);

// GET /api/cases/:case_id
router.get('/:case_id', getCaseDetails);

// PATCH /api/cases/:case_id
router.patch('/:case_id', updateCase);

// DELETE /api/cases/:case_id
router.delete('/:case_id', deleteCase);

// POST /api/cases/:case_id/notes
router.post('/:case_id/notes', addCaseNote);

module.exports = router;
