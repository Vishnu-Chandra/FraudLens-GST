const CallLog = require('../models/CallLog');
const Anomaly = require('../models/Anomaly');
const crypto = require('crypto');
const twilio = require('twilio');

const DEMO_NUMBER = process.env.TWILIO_DEMO_NUMBER || '+919876543210';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

function generateTwiML(gstin, businessName) {
  const engText = `Alert. This is an official communication from the GST Risk Intelligence System. ` +
    `A critical threat has been detected in the account of ${businessName}, GSTIN ${gstin}. ` +
    `Suspicious tax filing patterns including circular trading and invoice mismatch have been identified. ` +
    `Your account has been flagged for immediate investigation. ` +
    `Please contact the GST helpline at 1800 1200 232 urgently. Failure to respond may result in account suspension.`;

  const teText = `హెచ్చరిక! ఇది GST రిస్క్ ఇంటెలిజెన్స్ సిస్టమ్ నుండి అధికారిక సందేశం. ` +
    `${businessName}, GSTIN ${gstin} యొక్క ఖాతాలో తీవ్రమైన సందేహాస్పద పన్ను మోసం గుర్తించబడింది. ` +
    `సర్కులర్ ట్రేడింగ్ మరియు నకిలీ ఇన్వాయిస్ ఆధారాలు కనుగొనబడ్డాయి. ` +
    `మీ ఖాతా తక్షణ దర్యాప్తు కోసం గుర్తించబడింది. ` +
    `దయచేసి వెంటనే GST హెల్ప్‌లైన్ నంబర్ 1800 1200 232 కి సంప్రదించండి. లేకపోతే మీ ఖాతా నిలిపివేయబడవచ్చు.`;

  return `<Response>
  <Gather numDigits="1" timeout="3">
    <Say voice="Polly.Aditi" language="en-IN">${engText}</Say>
    <Pause length="2"/>
    <Say voice="Polly.Aditi" language="te-IN">${teText}</Say>
    <Pause length="1"/>
    <Say voice="Polly.Aditi" language="en-IN">This call has been recorded by the GST investigation unit. Thank you.</Say>
  </Gather>
  <Say voice="Polly.Aditi" language="en-IN">This call has been recorded. Goodbye.</Say>
</Response>`;
}

function getClient() {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
  }
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

function generateCallId() {
  return 'CALL-' + crypto.randomBytes(2).toString('hex').toUpperCase();
}

// Seed dummy call logs if empty
async function seedDemoCalls() {
  const count = await CallLog.countDocuments();
  if (count > 0) return;
  await CallLog.insertMany([
    {
      call_id: 'CALL-003',
      business_name: 'Beta Distributors',
      gstin: '27BBBBB2222B2Z6',
      dialed_number: DEMO_NUMBER,
      call_status: 'NO ANSWER',
      call_time: new Date('2026-03-10T14:20:00'),
      investigator: 'Officer Ravi',
    },
    {
      call_id: 'CALL-004',
      business_name: 'Gamma Suppliers',
      gstin: '19CCCC3333C3Z7',
      dialed_number: DEMO_NUMBER,
      call_status: 'BUSY',
      call_time: new Date('2026-03-11T09:15:00'),
      investigator: 'Officer Priya',
    },
  ]);
}

exports.getCallHistory = async (req, res) => {
  await seedDemoCalls();
  const logs = await CallLog.find().sort({ call_time: -1 });
  res.json({ success: true, data: logs });
};

exports.getPendingCalls = async (req, res) => {
  // Businesses with anomalies not yet called
  const calledGstins = await CallLog.find().distinct('gstin');
  const pending = await Anomaly.find({ businessGstin: { $nin: calledGstins } })
    .sort({ fraudProbability: -1 })
    .lean();
  res.json({ success: true, data: pending });
};

exports.initiateCall = async (req, res) => {
  const { business_name, gstin, investigator = 'Officer Ravi' } = req.body;
  if (!business_name || !gstin) return res.status(400).json({ success: false, message: 'Missing business_name or gstin' });
  try {
    const client = getClient();
    await client.calls.create({
      to: DEMO_NUMBER,
      from: TWILIO_PHONE_NUMBER,
      twiml: generateTwiML(gstin, business_name),
    });
    const callLog = await CallLog.create({
      call_id: generateCallId(),
      business_name,
      gstin,
      dialed_number: DEMO_NUMBER,
      call_status: 'COMPLETED',
      call_time: new Date(),
      investigator,
    });
    res.json({ success: true, data: callLog });
  } catch (err) {
    const callLog = await CallLog.create({
      call_id: generateCallId(),
      business_name,
      gstin,
      dialed_number: DEMO_NUMBER,
      call_status: 'FAILED',
      call_time: new Date(),
      investigator,
    });
    res.status(500).json({ success: false, message: err.message || 'Call failed', data: callLog });
  }
};
