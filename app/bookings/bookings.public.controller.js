import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

function parseBookingDate(value) {
  if (!value) return null

  // Поддержка: "YYYY-MM-DD" и ISO строки
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map((n) => parseInt(n, 10))
    const dt = new Date(Date.UTC(y, m - 1, d))
    return Number.isNaN(dt.getTime()) ? null : dt
  }

  const dt = new Date(value)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"]
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim()
  return req.socket?.remoteAddress || null
}

function parseIsoDateOnly(value) {
  if (!value || typeof value !== "string") return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split("-").map((n) => parseInt(n, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  return Number.isNaN(dt.getTime()) ? null : dt
}

function toIsoDateUtc(dt) {
  if (!dt) return null
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// @desc    Create booking request (public, no auth)
// @route   POST /api/bookings
export const createBookingRequest = asyncHandler(async (req, res) => {
  const body = req.body || {}

  const bookingDate = parseBookingDate(body.bookingDate)
  if (!bookingDate) {
    res.status(400)
    throw new Error("Некорректная дата бронирования")
  }

  const direction = String(body.direction || "").trim()
  const contactName = String(body.contactName || "").trim()
  const contactPhone = String(body.contactPhone || "").trim()
  const contactEmail = String(body.contactEmail || "").trim()
  const comment = body.comment != null && String(body.comment).trim() ? String(body.comment).trim() : null

  const entityType = body.entityType != null && String(body.entityType).trim() ? String(body.entityType).trim() : null
  const entitySlug = body.entitySlug != null && String(body.entitySlug).trim() ? String(body.entitySlug).trim() : null
  const entityTitle = body.entityTitle != null && String(body.entityTitle).trim() ? String(body.entityTitle).trim() : null
  const category = body.category != null && String(body.category).trim() ? String(body.category).trim() : null

  let entityId = null
  if (body.entityId) {
    const idStr = String(body.entityId)
    if (/^[0-9a-fA-F]{24}$/.test(idStr)) {
      entityId = idStr
    }
  }

  const created = await prisma.bookingRequest.create({
    data: {
      status: "new",
      bookingDate,
      direction,
      contactName,
      contactPhone,
      contactEmail,
      comment,
      entityType,
      entityId,
      entitySlug,
      entityTitle,
      category,
      userAgent: req.headers["user-agent"] ? String(req.headers["user-agent"]) : null,
      ip: getClientIp(req),
      raw: body.raw && typeof body.raw === "object" ? body.raw : null,
    },
  })

  res.status(201).json({ id: created.id, status: created.status })
})

// @desc    Get busy booking dates for guide (public)
// @route   GET /api/bookings/busy-dates?entityId=...&entitySlug=...&from=YYYY-MM-DD&to=YYYY-MM-DD
export const getBusyBookingDates = asyncHandler(async (req, res) => {
  const entityIdRaw = req.query.entityId != null ? String(req.query.entityId) : ""
  const entitySlugRaw = req.query.entitySlug != null ? String(req.query.entitySlug) : ""

  const entityId = /^[0-9a-fA-F]{24}$/.test(entityIdRaw) ? entityIdRaw : null
  const entitySlug = entitySlugRaw.trim() ? entitySlugRaw.trim() : null

  if (!entityId && !entitySlug) {
    res.status(400)
    throw new Error("entityId или entitySlug обязателен")
  }

  const from = parseIsoDateOnly(String(req.query.from || ""))
  const to = parseIsoDateOnly(String(req.query.to || ""))
  if (!from || !to) {
    res.status(400)
    throw new Error("Параметры from/to обязательны (YYYY-MM-DD)")
  }
  if (to.getTime() <= from.getTime()) {
    res.status(400)
    throw new Error("Некорректный диапазон дат")
  }

  const items = await prisma.bookingRequest.findMany({
    where: {
      status: { in: ["new", "processed"] },
      ...(entityId ? { entityId } : { entitySlug }),
      bookingDate: {
        gte: from,
        lt: to,
      },
    },
    select: { bookingDate: true },
  })

  const dates = Array.from(
    new Set(items.map((i) => toIsoDateUtc(i.bookingDate)).filter(Boolean))
  ).sort()

  res.json({ dates })
})

