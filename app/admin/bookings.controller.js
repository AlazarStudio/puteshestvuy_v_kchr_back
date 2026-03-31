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
  const sortBy = req.query.sortBy != null ? String(req.query.sortBy) : null
  const sortOrderRaw = req.query.sortOrder != null ? String(req.query.sortOrder) : "desc"
  const sortOrder = sortOrderRaw === "asc" ? "asc" : "desc"

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

  const orderBy = (() => {
    if (!sortBy) return { createdAt: "desc" }
    switch (sortBy) {
      case "createdAt":
        return { createdAt: sortOrder }
      case "bookingDate":
        return { bookingDate: sortOrder }
      case "direction":
        return { direction: sortOrder }
      case "contactName":
        return { contactName: sortOrder }
      case "entityTitle":
        return { entityTitle: sortOrder }
      case "status":
        return { status: sortOrder }
      case "type":
        return [{ category: sortOrder }, { entityType: sortOrder }]
      default:
        return { createdAt: "desc" }
    }
  })()

  const [items, total] = await Promise.all([
    prisma.bookingRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy,
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

