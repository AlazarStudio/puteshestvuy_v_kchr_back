import asyncHandler from 'express-async-handler'
import nodemailer from 'nodemailer'
import { prisma } from '../prisma.js'

function getRecipientEmail(content) {
  return content?.right?.formRecipientEmail?.trim() || ''
}

// @desc    Send feedback message
// @route   POST /api/footer/feedback
export const sendFeedback = asyncHandler(async (req, res) => {
  const { name, email, text } = req.body || {}

  if (!name?.trim() || !email?.trim() || !text?.trim()) {
    res.status(400).json({ message: 'Заполните все поля' })
    return
  }

  const footer = await prisma.footer.findUnique({
    where: { id: 'default' },
  })

  const content = footer?.content && typeof footer.content === 'object' ? footer.content : {}

  const recipientEmail = getRecipientEmail(content)
  if (!recipientEmail) {
    res.status(400).json({ message: 'Почта для получения сообщений не настроена' })
    return
  }

  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT || 587
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error('SMTP не настроен: SMTP_HOST, SMTP_USER, SMTP_PASS должны быть в .env')
    res.status(500).json({ message: 'Сервер не настроен для отправки почты' })
    return
  }

  const port = Number(smtpPort) || 587
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure: port === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  })

  const mailOptions = {
    from: process.env.SMTP_FROM || smtpUser,
    to: recipientEmail,
    replyTo: email.trim(),
    subject: `Обратная связь: ${(name || '').trim().slice(0, 50)}`,
    text: `Имя: ${(name || '').trim()}\nEmail: ${(email || '').trim()}\n\nСообщение:\n${(text || '').trim()}`,
    html: `
      <p><strong>Имя:</strong> ${String(name || '').trim().replace(/</g, '&lt;')}</p>
      <p><strong>Email:</strong> ${String(email || '').trim().replace(/</g, '&lt;')}</p>
      <p><strong>Сообщение:</strong></p>
      <p>${String(text || '').trim().replace(/\n/g, '<br>').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    `,
  }

  await transporter.sendMail(mailOptions)
  res.json({ success: true })
})
