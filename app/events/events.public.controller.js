import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"
import { parsePageLimit } from "../utils/validators.js"

// Событие считается прошедшим по endAt, а если конца нет — по startAt.
// Prisma не умеет сравнивать «одно поле или другое», поэтому условие
// выражается через OR: либо конец в будущем, либо конца нет и начало в будущем.
const upcomingWhere = (now) => ({
  isActive: true,
  OR: [
    { endAt: { gte: now } },
    { AND: [{ endAt: null }, { startAt: { gte: now } }] },
  ],
})

// Зеркало upcomingWhere: событие прошло, если конец в прошлом,
// а если конца нет — если в прошлом начало.
// Ветка с null здесь безопасна: endAt объявлен в схеме с самого начала,
// поэтому Prisma пишет его при создании явным null, а не пропускает поле
const pastWhere = (now) => ({
  isActive: true,
  OR: [
    { endAt: { lt: now } },
    { AND: [{ endAt: null }, { startAt: { lt: now } }] },
  ],
})

// @desc    Get upcoming active events (public, no auth)
// @route   GET /api/events
export const getEventsPublic = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = parsePageLimit(req.query.limit, 12)
  const skip = (page - 1) * limit
  const category = (req.query.category || '').trim()
  // Всё, кроме явного past, считается upcoming: так значение по умолчанию
  // сохраняется для существующих вызовов, а мусор в параметре не отдаёт пустоту
  const isPast = (req.query.when || '').trim() === 'past'

  const now = new Date()
  const where = isPast ? pastWhere(now) : upcomingWhere(now)
  if (category) where.category = category

  const [items, total] = await Promise.all([
    prisma.event.findMany({
      where,
      skip,
      take: limit,
      // Будущие — ближайшее первым, прошедшие — недавнее первым
      orderBy: { startAt: isPast ? 'desc' : 'asc' },
    }),
    prisma.event.count({ where }),
  ])

  res.json({
    items: items.map((item) => ({
      ...item,
      image: item.image || item.images?.[0] || null,
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  })
})

// @desc    Get event by slug or id (public, no auth)
// @route   GET /api/events/:idOrSlug
export const getEventByIdOrSlugPublic = asyncHandler(async (req, res) => {
  const idOrSlug = req.params.idOrSlug
  const isObjectId = /^[a-f\d]{24}$/i.test(idOrSlug)

  const event = isObjectId
    ? await prisma.event.findFirst({ where: { id: idOrSlug, isActive: true } })
    : await prisma.event.findFirst({ where: { slug: idOrSlug, isActive: true } })

  if (!event) {
    res.status(404)
    throw new Error('Событие не найдено')
  }

  // Связь с местом каталога разрешается отдельным запросом: в схеме её нет
  let place = null
  if (event.placeId) {
    place = await prisma.place.findFirst({
      where: { id: event.placeId, isActive: true },
      select: { id: true, title: true, slug: true, location: true, image: true },
    })
  }

  res.json({
    ...event,
    image: event.image || event.images?.[0] || null,
    place,
  })
})
