import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GoogleGenerativeAI } from '@google/generative-ai'
import twilio from 'twilio'

dotenv.config()
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const clientBuildDirectory = path.resolve(currentDirectory, '../client/dist')
const app = express()
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '50kb' }))
app.use(express.urlencoded({ extended: false }))

// Fictional records only. Do not use real student data in this prototype.
const guardianGroups = [
  { guardian: 'Ravi Kumar', seed: { id: 'STU-1001', name: 'Rahul Verma', section: 'B.Tech CSE · A', attendance: 'Present' } },
  { guardian: 'Meena Sharma', seed: { id: 'STU-1002', name: 'Priya Nair', section: 'B.Tech CSE · B', attendance: 'Present' } },
  { guardian: 'Suresh Patel', seed: { id: 'STU-1003', name: 'Arjun Rao', section: 'B.Tech IT · A', attendance: 'Not updated' } },
  { guardian: 'Lakshmi Reddy', seed: { id: 'STU-1004', name: 'Nisha Menon', section: 'B.Tech ECE · A', attendance: 'Absent' } },
  { guardian: 'Amit Singh', seed: { id: 'STU-1005', name: 'Vikram Das', section: 'B.Tech CSE · C', attendance: 'Present' } }
]
const generatedFirstNames = [
  'Aarav','Aadhya','Aarohi','Aditya','Aishwarya','Akash','Amrita','Ananya','Anika','Anirudh',
  'Arnav','Avani','Bhavya','Charan','Diya','Dhruv','Esha','Gautam','Ishita','Ishaan',
  'Jaya','Kabir','Kavya','Kiran','Krishna','Madhav','Meera','Mihir','Nandini','Neha',
  'Nikhil','Pallavi','Pranav','Raghav','Rhea','Rohan','Saanvi','Sahil','Samira','Tanvi',
  'Varun','Vedant','Vihaan','Yash','Zoya','Anmol','Deepa','Harini','Manav'
]
const generatedSurnames = ['Verma', 'Nair', 'Rao', 'Menon', 'Das', 'Gupta', 'Iyer', 'Bose', 'Kulkarni', 'Joshi']
const sections = ['B.Tech CSE · A', 'B.Tech CSE · B', 'B.Tech CSE · C', 'B.Tech IT · A', 'B.Tech ECE · A']
const attendanceOptions = ['Present', 'Present', 'Absent', 'Not updated']
const sampleStudents = Object.fromEntries(guardianGroups.flatMap((group, guardianIndex) => [
  [group.seed.id, { ...group.seed, guardian: group.guardian }],
  ...generatedFirstNames.map((firstName, index) => {
    const id = `STU-${1006 + guardianIndex * generatedFirstNames.length + index}`
    return [id, {
      name: `${firstName} ${generatedSurnames[index % generatedSurnames.length]}`,
      section: sections[(index + guardianIndex) % sections.length],
      attendance: attendanceOptions[(index + guardianIndex) % attendanceOptions.length],
      guardian: group.guardian
    }]
  })
]))
const emergencyTerms = [
  'emergency', 'urgent', 'help me now', 'in danger', 'not safe', 'unsafe',
  'accident', 'injured', 'hurt badly', 'hospital', 'kidnapped', 'missing child',
  'child is missing', 'bleeding', 'unconscious', 'cannot breathe', "can't breathe", 'can’t breathe',
  'missing', 'missing person', 'missing child', 'lost', 'disappeared', 'my child is missing', 'my family member is missing',
  'health issue', 'health problem', 'medical issue', 'medical problem', 'health emergency',
  'my health', 'sick', 'fever', 'hospitalized', 'panic attack', 'severe pain',
  'family problem', 'family problems', 'family issue', 'family issues', 'problem with my family',
  'home problem', 'problems at home', 'domestic problem', 'abuse', 'unsafe at home',
  'my family is in trouble', 'i am scared', 'threat', 'fighting at home', 'someone is hurting me'
]
const calls = []
const getGuardianNumber = () => process.env.GUARDIAN_PHONE_NUMBER || process.env.COUNSELOR_PHONE_NUMBER || ''

function normalizeDetectionText(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
const telephonyConfigured = Boolean(
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_PHONE_NUMBER &&
  getGuardianNumber()
)
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  service: 'CareConnect AI API',
  geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  telephonyConfigured
}))
app.get('/api/students/:id', (req, res) => {
  const student = sampleStudents[req.params.id]
  if (!student) return res.status(404).json({ error: 'Student record not found in demo data.' })
  return res.json({ id: req.params.id, ...student, demo: true })
})
app.get('/api/calls', (_req, res) => res.json({ items: calls.slice(-100).reverse(), demo: true }))

function isEmergency(text = '') {
  const lower = normalizeDetectionText(text)
  const normalizedTerms = emergencyTerms.map(term => normalizeDetectionText(term))
  return normalizedTerms.some(term => lower.includes(term))
}
function addCall(item) {
  calls.push({ at: new Date().toISOString(), ...item })
  if (calls.length > 500) calls.shift()
}
function getPublicBaseUrl() {
  return process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '')
}
function validateTwilioRequest(req, res, next) {
  const token = process.env.TWILIO_AUTH_TOKEN
  const baseUrl = getPublicBaseUrl()
  const signature = req.get('X-Twilio-Signature')
  if (!token || !baseUrl || !signature) {
    return res.status(403).send('Twilio webhook validation is not configured.')
  }
  const requestUrl = `${baseUrl}${req.originalUrl}`
  const valid = twilio.validateRequest(token, signature, requestUrl, req.body)
  if (!valid) return res.status(403).send('Invalid Twilio webhook signature.')
  next()
}
function sendTwiML(res, voice) {
  return res.status(200).type('text/xml').send(voice.toString())
}
function askForSpeech(voice, baseUrl, prompt) {
  const gather = voice.gather({
    input: 'speech',
    action: `${baseUrl}/api/telephony/voice-turn`,
    method: 'POST',
    speechTimeout: 'auto',
    timeout: 5,
    actionOnEmptyResult: true
  })
  gather.say({ language: 'en-IN' }, prompt)
  voice.say({ language: 'en-IN' }, 'I did not hear a response. Goodbye.')
  voice.hangup()
}

async function generateVoiceReply(message) {
  if (!process.env.GEMINI_API_KEY) {
    return 'I am the CareConnect automated assistant. I can take a brief message for your guardian. If this is urgent, please say emergency or ask for immediate human help.'
  }
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' })
    const result = await model.generateContent(
      `You are CareConnect AI, a brief voice assistant supporting a student and their guardian. ` +
      `Respond in one or two short, calm sentences. Do not claim to be human, a therapist, or emergency services. ` +
      `Do not diagnose or promise help is on the way. If the caller describes danger, injury, abuse, a missing person, ` +
      `or urgent risk, return exactly: EMERGENCY_ESCALATION. Otherwise acknowledge them and invite a short next response. ` +
      `Caller said: ${JSON.stringify(message)}`
    )
    const reply = result.response.text().trim()
    return isEmergency(message) || /EMERGENCY_ESCALATION/i.test(reply)
      ? 'EMERGENCY_ESCALATION'
      : reply.slice(0, 700)
  } catch (error) {
    console.error('Gemini voice reply failed:', error.message)
    return 'I am having trouble responding right now. If you need urgent support, say emergency to try to reach your guardian.'
  }
}

app.post('/api/agent/respond', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  const studentId = typeof req.body?.studentId === 'string' ? req.body.studentId : 'STU-1001'
  if (!message) return res.status(400).json({ error: 'message is required' })
  if (message.length > 3000) return res.status(413).json({ error: 'message is too long' })
  const emergency = isEmergency(message)
  const student = sampleStudents[studentId]
  const apiKey = process.env.GEMINI_API_KEY
  if (apiKey && !emergency) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' })
      const prompt = `You are a careful AI assistant for a student guardian support desk. Use only the fictional sample record below. Never invent student facts. If information is unavailable, say a human guardian/support person must verify it. If a potential emergency is described, tell the user a human must be contacted immediately. Return JSON only with keys reply (string), priority (normal|high|emergency), escalate (boolean), summary (string). Record: ${JSON.stringify(student || { note: 'No matching sample record' })}. Message: ${JSON.stringify(message)}.`
      const result = await model.generateContent(prompt)
      const raw = result.response.text().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      const parsed = JSON.parse(raw)
      addCall({ message, ...parsed, studentId })
      return res.json({ ...parsed, source: 'gemini', demoData: true })
    } catch (err) { console.error('Gemini request failed:', err.message) }
  }
  if (emergency) {
    const item = {
      message, studentId,
      reply: 'This may be an emergency. I will try to connect you to the configured guardian. If there is immediate danger, contact local emergency services directly; do not wait for this app.',
      priority: 'emergency', escalate: true,
      summary: 'Possible emergency; urgent human review required.'
    }
    addCall(item)
    return res.json({ ...item, source: 'safe-fallback', liveTransferAvailable: telephonyConfigured })
  }
  const match = message.toLowerCase().match(/attendance|present|absent|attend/)
  const result = match && student
    ? { reply: `The demo record for ${student.name} (${student.section}) shows attendance as "${student.attendance}". This is fictional sample data; verify against official records.`, priority: 'normal', escalate: false, summary: `Attendance question about ${student.name}.` }
    : { reply: 'I have recorded your question. This demo does not have a verified answer, so a guardian/support person should review it before any student information is shared.', priority: 'normal', escalate: false, summary: 'Query needs human verification.' }
  addCall({ message, studentId, ...result })
  return res.json({ ...result, source: 'demo-fallback', demoData: true })
})

// Real inbound phone flow: AI answers first. On emergency, <Dial> bridges the same caller
// to the configured guardian if the guardian answers. This requires provider support and a public HTTPS URL.
app.post('/api/telephony/incoming', validateTwilioRequest, (req, res) => {
  const baseUrl = getPublicBaseUrl()
  const voice = new twilio.twiml.VoiceResponse()
  voice.say({ language: 'en-IN' }, 'Welcome to CareConnect AI. I am an automated assistant, not a human. How can I help you today?')
  askForSpeech(voice, baseUrl, 'Please briefly tell me what is happening. If this is an emergency, say emergency.')
  return sendTwiML(res, voice)
})

// Each speech turn either responds with AI or transfers the same live call to the guardian.
app.post('/api/telephony/voice-turn', validateTwilioRequest, async (req, res) => {
  const baseUrl = getPublicBaseUrl()
  const speech = String(req.body?.SpeechResult || '').trim()
  const voice = new twilio.twiml.VoiceResponse()

  if (!speech) {
    askForSpeech(voice, baseUrl, 'I did not understand. Please say a short sentence, or say emergency if you need urgent help.')
    return sendTwiML(res, voice)
  }

  const aiReply = isEmergency(speech) ? 'EMERGENCY_ESCALATION' : await generateVoiceReply(speech)
  if (aiReply === 'EMERGENCY_ESCALATION' || isEmergency(speech)) {
    addCall({ type: 'voice-emergency', summary: 'Possible emergency detected during live voice call.', priority: 'Emergency', status: 'Guardian transfer attempted', caller: 'Inbound caller' })
    voice.say({ language: 'en-IN' }, 'I understand you may need urgent human support. I will try to connect you to your configured guardian now.')
    const guardian = getGuardianNumber()
    if (!guardian || !twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
      voice.say({ language: 'en-IN' }, 'The guardian phone connection is not configured. Please contact a trusted adult or local emergency services directly if you are in immediate danger.')
      voice.hangup()
      return sendTwiML(res, voice)
    }
    const dial = voice.dial({
      callerId: process.env.TWILIO_PHONE_NUMBER,
      timeout: 20,
      action: `${baseUrl}/api/telephony/guardian-transfer-result`,
      method: 'POST',
      answerOnBridge: true
    })
    dial.number(guardian)
    return sendTwiML(res, voice)
  }

  addCall({ type: 'voice-turn', message: speech, summary: speech.slice(0, 180), priority: 'Normal', status: 'AI handled', caller: 'Inbound caller' })
  askForSpeech(voice, baseUrl, `${aiReply} If you need urgent help, say emergency. What would you like to share next?`)
  return sendTwiML(res, voice)
})

// Called after the guardian's ring attempt ends. If not answered, return to the original caller.
app.post('/api/telephony/guardian-transfer-result', validateTwilioRequest, (req, res) => {
  const voice = new twilio.twiml.VoiceResponse()
  const status = String(req.body?.DialCallStatus || 'unknown')
  addCall({ type: 'guardian-transfer-result', callStatus: status, summary: `Guardian transfer result: ${status}`, priority: 'Emergency', status })
  if (status === 'completed') {
    voice.say({ language: 'en-IN' }, 'The guardian call has ended. If you still need support, please reach out to a trusted adult.')
  } else {
    voice.say({ language: 'en-IN' }, 'I could not reach the guardian. Please contact a trusted adult directly. If you are in immediate danger, contact local emergency services now. Do not wait for this system.')
  }
  voice.hangup()
  return sendTwiML(res, voice)
})

// Backwards-compatible outbound guardian notification endpoint (not an existing-call transfer).
app.post('/api/emergency/call-counselor', async (req, res) => {
  const to = getGuardianNumber()
  if (!twilioClient || !to || !process.env.TWILIO_PHONE_NUMBER) {
    return res.status(503).json({ error: 'Telephony is not configured. Set Twilio credentials, GUARDIAN_PHONE_NUMBER and TWILIO_PHONE_NUMBER in server/.env.' })
  }
  const origin = getPublicBaseUrl()
  if (!origin) return res.status(503).json({ error: 'Set PUBLIC_BASE_URL to your public HTTPS backend URL before enabling live calls.' })
  try {
    const call = await twilioClient.calls.create({
      to, from: process.env.TWILIO_PHONE_NUMBER,
      url: `${origin}/api/telephony/guardian-voice`, method: 'POST'
    })
    return res.json({ ok: true, callSid: call.sid, status: call.status, note: 'Outbound guardian notification started. This does not transfer an existing inbound call.' })
  } catch (error) {
    console.error('Twilio call failed:', error.message)
    return res.status(502).json({ error: 'Could not initiate guardian call. Check provider settings and regional voice availability.' })
  }
})
app.post('/api/telephony/guardian-voice', validateTwilioRequest, (_req, res) => {
  const voice = new twilio.twiml.VoiceResponse()
  voice.say({ language: 'en-IN' }, 'CareConnect AI notification. Please check the guardian dashboard and contact the caller if appropriate.')
  return sendTwiML(res, voice)
})
app.post('/api/telephony/status', validateTwilioRequest, (req, res) => {
  addCall({ type: 'telephony-status', callStatus: req.body?.CallStatus || 'unknown', callSid: req.body?.CallSid || null })
  res.sendStatus(204)
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }))
app.use(express.static(clientBuildDirectory, { maxAge: '1h' }))
app.get('*', (_req, res) => res.sendFile(path.join(clientBuildDirectory, 'index.html')))

const port = Number(process.env.PORT || 4000)
app.listen(port, '0.0.0.0', () => console.log(`CareConnect AI listening on port ${port}`))
