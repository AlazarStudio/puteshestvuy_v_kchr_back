import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

// @desc    List booking requests (admin)
// @route   GET /api/admin/bookings
export const getBookingRequests = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = Math.min(parseInt(req.query.limit) || 50, 200)
  const skip = (page - 1) * limit

  const status = req.query.status ? String(req.query.status) : null
  const search = (req.query.search || "").trim()
  const includeHiddenRaw = req.query.includeHidden != null ? String(req.query.includeHidden) : ""
  const includeHidden = includeHiddenRaw === "1" || includeHiddenRaw.toLowerCase() === "true"

  const where = {}
  if (!includeHidden) where.isVisible = true
  if (status) where.status = status
  if (search) {
    where.OR = [
      { contactName: { contains: search, mode: "insensitive" } },
      { contactPhone: { contains: search, mode: "insensitive" } },
      { contactEmail: { contains: search, mode: "insensitive" } },
      { direction: { contains: search, mode: "insensitive" } },
      { entityTitle: { contains: search, mode: "insensitive" } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.bookingRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.bookingRequest.count({ where }),
  ])

  res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  })
})

// @desc    Update booking status (admin)
// @route   PATCH /api/admin/bookings/:id
export const updateBookingRequestStatus = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { status } = req.body || {}

  const nextStatus = status != null ? String(status) : ""
  const allowed = new Set(["new", "processed", "cancelled"])
  if (!allowed.has(nextStatus)) {
    res.status(400)
    throw new Error("Некорректный статус")
  }

  const updated = await prisma.bookingRequest.update({
    where: { id },
    data: { status: nextStatus },
  })

  res.json(updated)
})

// @desc    Soft delete/restore booking (admin)
// @route   PATCH /api/admin/bookings/:id/visibility
export const updateBookingRequestVisibility = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { isVisible } = req.body || {}

  if (typeof isVisible !== "boolean") {
    res.status(400)
    throw new Error("isVisible должен быть boolean")
  }

  const updated = await prisma.bookingRequest.update({
    where: { id },
    data: { isVisible },
  })

  res.json(updated)
})

