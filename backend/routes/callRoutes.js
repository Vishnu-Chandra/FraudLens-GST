const express = require('express');
const router = express.Router();
const callController = require('../controllers/callController');

router.get('/history', callController.getCallHistory);
router.get('/pending', callController.getPendingCalls);
router.post('/initiate', callController.initiateCall);

module.exports = router;
