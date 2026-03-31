import nodemailer from "nodemailer"

let cachedTransporter = null

export function isMailerConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

export function getMailerTransporter() {
  if (cachedTransporter) return cachedTransporter

  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT || 587
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpSecureRaw = process.env.SMTP_SECURE

  const port = Number(smtpPort) || 587
  const secure =
    smtpSecureRaw != null
      ? ["1", "true", "yes"].includes(String(smtpSecureRaw).trim().toLowerCase())
      : port === 465
  cachedTransporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  })

  return cachedTransporter
}

export async function sendMailSafe({ to, subject, text, html, replyTo } = {}) {
  if (!to || !subject) return { ok: false, skipped: true, reason: "missing_to_or_subject" }
  if (!isMailerConfigured()) return { ok: false, skipped: true, reason: "not_configured" }

  const smtpUser = process.env.SMTP_USER
  const from = process.env.SMTP_FROM || process.env.MAIL_FROM || smtpUser
  const transporter = getMailerTransporter()

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
      ...(replyTo ? { replyTo } : {}),
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err }
  }
}

