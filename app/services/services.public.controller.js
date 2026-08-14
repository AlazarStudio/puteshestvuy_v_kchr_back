import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"
import { parsePageLimit, warnIfListOutgrewLimit } from "../utils/validators.js"
import { findApprovedReviews } from "../utils/rating.js"

// Совпадение метки локации (фильтр гостиниц/ресторанов) с текстом поля address.
// Ключи должны совпадать с SERVICE_LOCATION_OPTIONS на фронте.
// Районы дополнительно матчат свои сёла, т.к. в адресах чаще указано село, а не район.
const LOCATION_MATCH_ALIASES = {
  "Теберда": ["Теберда"],
  "Домбай": ["Домбай"],
  "Архыз": ["Архыз"],
  "Махар": ["Махар"],
  "Малокарачаевский район": [
    "Малокарачаевский район",
    "Учкекен",
    "Кичи-Балык",
    "Первомайское",
    "Красный Восток",
    "Терезе",
    "Джага",
    "Элькуш",
    "Римгорское",
    "Джилы-Су",
    "Джылы-Су",
  ],
  "Зеленчукский район": [
    "Зеленчукский район",
    "Архыз",
    "Зеленчукская",
    "Нижний Архыз",
    "Романтик",
    "Кардоникская",
    "Исправная",
    "Сторожевая",
    "Даусуз",
    "Маруха",
  ],
}

// @desc    Get active services (public, no auth)
// @route   GET /api/services
export const getServicesPublic = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = parsePageLimit(req.query.limit, 100)
  const skip = (page - 1) * limit
  const search = (req.query.search || "").trim()

  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])
  const categoriesArr = arr(
    req.query.category ?? req.query["category[]"] ?? req.query.categories
  ).filter(Boolean)

  const where = { isActive: true }
  const andClauses = []

  if (search) {
    andClauses.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { category: { contains: search, mode: "insensitive" } },
        { shortDescription: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    })
  }

  if (categoriesArr.length > 0) {
    where.category = { in: categoriesArr }
  }

  if (req.query.cardPayment === 'true') {
    where.cardPayment = true
  }

  // Фильтр по локации: матчинг метки (и её алиасов-сёл) по свободному тексту address
  const locationsArr = arr(
    req.query.locations ?? req.query["locations[]"] ?? req.query.location
  ).filter(Boolean)

  if (locationsArr.length > 0) {
    const terms = [
      ...new Set(
        locationsArr.flatMap((loc) =>
          Object.hasOwn(LOCATION_MATCH_ALIASES, loc) ? LOCATION_MATCH_ALIASES[loc] : [loc]
        )
      ),
    ]
    if (terms.length > 0) {
      andClauses.push({
        OR: terms.map((t) => ({ address: { contains: t, mode: "insensitive" } })),
      })
    }
  }

  if (andClauses.length > 0) {
    where.AND = andClauses
  }

  // Определяем сортировку
  const sortBy = (req.query.sortBy || 'createdAt').toLowerCase()
  const hotelSelected = categoriesArr.includes('Гостиница')
  // при выбранной категории «Гостиница» первым ключом всегда идёт оплата картой
  const withHotelFirst = (keys) => (hotelSelected ? [{ cardPayment: 'desc' }, ...keys] : keys)
  let orderBy
  if (sortBy === 'popularity') {
    orderBy = withHotelFirst([{ uniqueViewsCount: 'desc' }, { createdAt: 'desc' }])
  } else if (sortBy === 'rating') {
    orderBy = withHotelFirst([
      { rating: 'desc' },
      { reviewsCount: 'desc' },
      { uniqueViewsCount: 'desc' },
      { createdAt: 'desc' },
    ])
  } else if (sortBy === 'reviews') {
    orderBy = withHotelFirst([
      { reviewsCount: 'desc' },
      { rating: 'desc' },
      { createdAt: 'desc' },
    ])
  } else {
    orderBy = hotelSelected
      ? [{ cardPayment: 'desc' }, { createdAt: 'desc' }]
      : [{ createdAt: 'desc' }, { id: 'asc' }]
  }

  const [items, total] = await Promise.all([
    prisma.service.findMany({
      where,
      skip,
      take: limit,
      orderBy,
    }),
    prisma.service.count({ where }),
  ])

  warnIfListOutgrewLimit("услуги", total, limit)

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
  })

  if (!service) {
    res.status(404)
    throw new Error("Услуга не найдена")
  }

  // Отслеживание уникальных просмотров
  if (req.visitorId) {
    try {
      // Ищем существующий просмотр
      const whereCondition = {
        entityType: 'service',
        entityId: service.id,
        OR: req.userId 
          ? [{ userId: req.userId }]
          : [{ visitorId: req.visitorId }],
      }

      const existingView = await prisma.viewTracking.findFirst({
        where: whereCondition,
      })

      if (!existingView) {
        // Создаем запись о просмотре
        await prisma.viewTracking.create({
          data: {
            entityType: 'service',
            entityId: service.id,
            userId: req.userId || null,
            visitorId: req.userId ? null : req.visitorId,
          },
        })

        // Увеличиваем счетчик уникальных просмотров
        try {
          const currentService = await prisma.service.findUnique({
            where: { id: service.id },
            select: { uniqueViewsCount: true },
          })
          
          const currentCount = currentService?.uniqueViewsCount ?? 0
          const newCount = currentCount + 1
          const updatedService = await prisma.service.update({
            where: { id: service.id },
            data: {
              uniqueViewsCount: newCount,
            },
          })
          
          service.uniqueViewsCount = updatedService.uniqueViewsCount ?? newCount
        } catch (updateError) {
          console.error('[View Tracking] Error updating service uniqueViewsCount:', updateError.message)
          const currentCount = service.uniqueViewsCount ?? 0
          try {
            const directUpdate = await prisma.service.update({
              where: { id: service.id },
              data: { uniqueViewsCount: currentCount + 1 },
            })
            service.uniqueViewsCount = directUpdate.uniqueViewsCount
          } catch (directError) {
            console.error('[View Tracking] Error in direct update:', directError.message)
          }
        }
      } else {
        // Получаем актуальный счетчик из базы
        const currentService = await prisma.service.findUnique({
          where: { id: service.id },
          select: { uniqueViewsCount: true },
        })
        service.uniqueViewsCount = currentService?.uniqueViewsCount ?? 0
      }
    } catch (error) {
      // Игнорируем ошибки отслеживания, чтобы не ломать основной функционал
      console.error('Error tracking view:', error)
    }
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
    reviews: await findApprovedReviews('service', service.id),
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
