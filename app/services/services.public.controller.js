import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

// @desc    Get active services (public, no auth)
// @route   GET /api/services
export const getServicesPublic = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = Math.min(parseInt(req.query.limit) || 100, 100)
  const skip = (page - 1) * limit
  const search = (req.query.search || "").trim()

  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])
  const categoriesArr = arr(
    req.query.category ?? req.query["category[]"] ?? req.query.categories
  ).filter(Boolean)

  const where = { isActive: true }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
      { shortDescription: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ]
  }

  if (categoriesArr.length > 0) {
    where.category = { in: categoriesArr }
  }

  const [items, total] = await Promise.all([
    prisma.service.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.service.count({ where }),
  ])

  res.json({
    items: items.map((item) => ({
      ...item,
      image: item.images?.[0] || null,
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  })
})

// @desc    Get service by id or slug (public, no auth)
// @route   GET /api/services/:idOrSlug
export const getServiceByIdOrSlugPublic = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params

  const isObjectId = /^[0-9a-fA-F]{24}$/.test(idOrSlug)

  const service = await prisma.service.findFirst({
    where: {
      isActive: true,
      ...(isObjectId ? { id: idOrSlug } : { slug: idOrSlug }),
    },
    include: {
      reviews: {
        where: { status: "approved" },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!service) {
    res.status(404)
    throw new Error("Услуга не найдена")
  }

  res.json(service)
})
