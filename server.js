/* ============================================================
   ChatWave v3.1 — server.js
   Backend كامل مع MongoDB و Gmail
   مجاني 100%
   ============================================================ */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

/* ══════════ MongoDB Connection ══════════ */
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://user:password@cluster.mongodb.net/chatwave', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ MongoDB Connected');
}).catch(err => {
  console.error('❌ MongoDB Error:', err);
});

/* ══════════ Schemas ══════════ */

// User Schema
const userSchema = new mongoose.Schema({
  displayName: { type: String, required: true },
  email: { type: String, unique: true, required: true, lowercase: true },
  password: { type: String, required: true },
  phone: String,
  avatar: String,
  emailVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now }
});

// Verification Code Schema
const verificationCodeSchema = new mongoose.Schema({
  email: String,
  code: String,
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now, expires: 600 } // ينتهي بعد 10 دقائق
});

// OTP Schema
const otpSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  code: String,
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now, expires: 600 }
});

// Message Schema
const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: String,
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', userSchema);
const VerificationCode = mongoose.model('VerificationCode', verificationCodeSchema);
const OTP = mongoose.model('OTP', otpSchema);
const Message = mongoose.model('Message', messageSchema);

/* ══════════ Gmail Setup ══════════ */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'your-email@gmail.com',
    pass: process.env.GMAIL_PASSWORD || 'your-app-password'
  }
});

/* ══════════ Utilities ══════════ */

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateAvatar(name) {
  const colors = ['FF6B6B', '4ECDC4', '45B7D1', 'FFA07A', '98D8C8'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23${color}'/><text x='50' y='60' font-size='50' text-anchor='middle' fill='white' font-family='Arial'>${name[0]}</text></svg>`;
}

async function sendEmail(to, subject, code) {
  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER || 'ChatWave <noreply@chatwave.com>',
      to: to,
      subject: subject,
      html: `
        <div style="font-family: Arial; direction: rtl; text-align: right; padding: 20px; background: #f5f5f5; border-radius: 10px;">
          <h2 style="color: #06B6D4;">مرحباً بك في ChatWave</h2>
          <p style="font-size: 16px; color: #333;">رمز التحقق الخاص بك:</p>
          <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h1 style="color: #06B6D4; letter-spacing: 5px; font-family: monospace;">${code}</h1>
          </div>
          <p style="color: #666; font-size: 14px;">⏱️ الرمز صالح لمدة 10 دقائق فقط</p>
          <p style="color: #666; font-size: 14px;">🔒 لا تشارك هذا الرمز مع أحد</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">© 2024 ChatWave - جميع الحقوق محفوظة</p>
        </div>
      `
    });
    return true;
  } catch (err) {
    console.error('❌ Email Error:', err);
    return false;
  }
}

/* ══════════ API Routes ══════════ */

// Test Route
app.get('/api/test', (req, res) => {
  res.json({ message: '✅ Server is running!' });
});

/* ══════════ SIGNUP ══════════ */
app.post('/api/signup', async (req, res) => {
  try {
    const { displayName, email, password, phone } = req.body;

    // Validation
    if (!displayName || !email || !password) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'هذا البريد مسجل بالفعل' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      displayName,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone || '',
      avatar: generateAvatar(displayName)
    });

    await user.save();

    // Generate verification code
    const code = generateCode();
    const verificationCode = new VerificationCode({
      email: email.toLowerCase(),
      code: code
    });

    await verificationCode.save();

    // Send email
    const emailSent = await sendEmail(
      email,
      'رمز التحقق من ChatWave',
      code
    );

    res.json({
      success: true,
      message: emailSent ? 'تم التسجيل بنجاح، تحقق من بريدك' : 'تم التسجيل لكن حدث خطأ في الإيميل',
      userId: user._id,
      testCode: code // للاختبار فقط (احذفه في الإنتاج)
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════ VERIFY EMAIL ══════════ */
app.post('/api/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    // Find verification code
    const verCode = await VerificationCode.findOne({
      email: email.toLowerCase(),
      code: code
    });

    if (!verCode) {
      return res.status(401).json({ error: 'رمز التحقق غير صحيح أو انتهت صلاحيته' });
    }

    // Update user
    await User.updateOne(
      { email: email.toLowerCase() },
      { emailVerified: true }
    );

    // Delete verification code
    await VerificationCode.deleteOne({ _id: verCode._id });

    res.json({ success: true, message: 'تم التحقق بنجاح' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════ LOGIN ══════════ */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ error: 'البريد أو كلمة المرور خاطئة' });
    }

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'البريد أو كلمة المرور خاطئة' });
    }

    // Generate OTP for password reset (optional)
    const otp = generateCode();
    const otpRecord = new OTP({
      userId: user._id,
      code: otp
    });

    await otpRecord.save();

    // Send OTP
    await sendEmail(
      user.email,
      'رمز التحقق من ChatWave',
      otp
    );

    // Update last login
    await User.updateOne(
      { _id: user._id },
      { lastSeen: new Date() }
    );

    res.json({
      success: true,
      user: {
        uid: user._id,
        displayName: user.displayName,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        emailVerified: user.emailVerified
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════ FORGOT PASSWORD ══════════ */
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ error: 'لم يتم العثور على حساب بهذا البريد' });
    }

    // Generate code
    const code = generateCode();
    const verCode = new VerificationCode({
      email: email.toLowerCase(),
      code: code
    });

    await verCode.save();

    // Send email
    await sendEmail(
      user.email,
      'رمز استعادة كلمة المرور',
      code
    );

    res.json({
      success: true,
      message: 'تم إرسال رمز التحقق على بريدك',
      testCode: code // للاختبار فقط
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════ RESET PASSWORD ══════════ */
app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    // Verify code
    const verCode = await VerificationCode.findOne({
      email: email.toLowerCase(),
      code: code
    });

    if (!verCode) {
      return res.status(401).json({ error: 'رمز التحقق غير صحيح أو انتهت صلاحيته' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await User.updateOne(
      { email: email.toLowerCase() },
      { password: hashedPassword }
    );

    // Delete code
    await VerificationCode.deleteOne({ _id: verCode._id });

    res.json({ success: true, message: 'تم تحديث كلمة المرور بنجاح' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════ GET USER ══════════ */
app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    res.json({
      uid: user._id,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      lastSeen: user.lastSeen
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════ SEND MESSAGE ══════════ */
app.post('/api/messages', async (req, res) => {
  try {
    const { senderId, receiverId, text } = req.body;

    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);

    if (!sender || !receiver) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const message = new Message({
      senderId,
      senderName: sender.displayName,
      receiverId,
      text
    });

    await message.save();

    res.json({ success: true, message });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════ GET MESSAGES ══════════ */
app.get('/api/messages/:senderId/:receiverId', async (req, res) => {
  try {
    const { senderId, receiverId } = req.params;

    const messages = await Message.find({
      $or: [
        { senderId: senderId, receiverId: receiverId },
        { senderId: receiverId, receiverId: senderId }
      ]
    }).sort({ createdAt: 1 });

    res.json(messages);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════ Server Listening ══════════ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
