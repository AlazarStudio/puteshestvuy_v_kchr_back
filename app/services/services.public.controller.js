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

  const routeIds = Array.isArray(service.routeIds) ? service.routeIds : []
  let routes = []
  if (service.category === "Гид" && routeIds.length > 0) {
    routes = await prisma.route.findMany({
      where: { id: { in: routeIds }, isActive: true },
      select: {
        id: true,
        title: true,
        slug: true,
        shortDescription: true,
        images: true,
        distance: true,
        duration: true,
        difficulty: true,
        rating: true,
        reviewsCount: true,
      },
    })
    // Порядок как в routeIds
    const byId = Object.fromEntries(routes.map((r) => [r.id, r]))
    routes = routeIds.map((id) => byId[id]).filter(Boolean)
  }

  res.json({
    ...service,
    routeIds,
    routes,
  })
})

// @desc    Create review for service (public, no auth) — статус pending, модерация в админке
// @route   POST /api/services/:serviceId/reviews
export const createServiceReview = asyncHandler(async (req, res) => {
  const { serviceId } = req.params
  const { authorName, rating, text, authorAvatar } = req.body || {}

  if (!authorName || !String(authorName).trim()) {
    res.status(400)
    throw new Error("Укажите имя")
  }
  const ratingNum = parseInt(rating, 10)
  if (Number.isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    res.status(400)
    throw new Error("Рейтинг должен быть от 1 до 5")
  }
  if (!text || !String(text).trim()) {
    res.status(400)
    throw new Error("Напишите текст отзыва")
  }

  const isObjectId = /^[a-f\d]{24}$/i.test(serviceId)
  const service = await prisma.service.findFirst({
    where: isObjectId
      ? { id: serviceId, isActive: true }
      : { slug: serviceId, isActive: true },
    select: { id: true, title: true },
  })

  if (!service) {
    res.status(404)
    throw new Error("Услуга не найдена")
  }

  const review = await prisma.review.create({
    data: {
      authorName: String(authorName).trim(),
      authorAvatar:
        authorAvatar && String(authorAvatar).trim() ? String(authorAvatar).trim() : null,
      rating: ratingNum,
      text: String(text).trim(),
      status: "pending",
      entityType: "service",
      entityId: service.id,
      entityTitle: service.title,
      serviceId: service.id,
    },
  })

  res.status(201).json(review)
})
