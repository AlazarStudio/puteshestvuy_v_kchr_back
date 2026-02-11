import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"


function getExtraGroupsFromConfig(config) {
  const raw = config?.extraGroups
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr.filter((g) => g && typeof g.key === 'string' && g.key.trim()).map((g) => ({
    key: String(g.key).trim(),
    label: typeof g.label === 'string' ? g.label.trim() || g.key : String(g.key),
    icon: typeof g.icon === 'string' && g.icon.trim() ? g.icon.trim() : null,
    iconType: g.iconType === 'upload' || g.iconType === 'library' ? g.iconType : null,
    values: Array.isArray(g.values) ? g.values.filter((v) => typeof v === 'string' && v.trim()) : [],
  }))
}

// @desc    Get route filters config (public, no auth)
// @route   GET /api/routes/filters
export const getRouteFiltersPublic = asyncHandler(async (req, res) => {
  const config = await prisma.routeFilterConfig.findUnique({
    where: { id: 'default' },
  })
  if (!config) {
    return res.json({
      seasons: [],
      transport: [],
      durationOptions: [],
      difficultyLevels: [],
      distanceOptions: [],
      elevationOptions: [],
      isFamilyOptions: [],
      hasOvernightOptions: [],
      extraGroups: [],
      fixedGroupMeta: {},
    })
  }
  const extraGroups = getExtraGroupsFromConfig(config)
  const fixedGroupMeta = config.fixedGroupMeta && typeof config.fixedGroupMeta === 'object' ? config.fixedGroupMeta : {}
  res.json({
    seasons: Array.isArray(config.seasons) ? config.seasons : [],
    transport: Array.isArray(config.transport) ? config.transport : [],
    durationOptions: Array.isArray(config.durationOptions) ? config.durationOptions : [],
    difficultyLevels: Array.isArray(config.difficultyLevels) ? config.difficultyLevels : [],
    distanceOptions: Array.isArray(config.distanceOptions) ? config.distanceOptions : [],
    elevationOptions: Array.isArray(config.elevationOptions) ? config.elevationOptions : [],
    isFamilyOptions: Array.isArray(config.isFamilyOptions) ? config.isFamilyOptions : [],
    hasOvernightOptions: Array.isArray(config.hasOvernightOptions) ? config.hasOvernightOptions : [],
    extraGroups,
    fixedGroupMeta,
  })
})

// @desc    Get active routes (public, no auth)
// @route   GET /api/routes
export const getRoutesPublic = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = Math.min(parseInt(req.query.limit) || 12, 100)
  const skip = (page - 1) * limit
  const search = (req.query.search || '').trim()
  const sortBy = (req.query.sortBy || 'createdAt').toLowerCase()

  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])
  const seasonsArr = arr(req.query.seasons || req.query['seasons[]']).filter(Boolean)
  const transportArr = arr(req.query.transport || req.query['transport[]']).filter(Boolean)
  const durationArr = arr(req.query.durationOptions || req.query['durationOptions[]']).filter(Boolean)
  const difficultyArr = arr(req.query.difficultyLevels || req.query['difficultyLevels[]']).filter(Boolean)
  const distanceArr = arr(req.query.distanceOptions || req.query['distanceOptions[]']).filter(Boolean)
  const elevationArr = arr(req.query.elevationOptions || req.query['elevationOptions[]']).filter(Boolean)
  const isFamilyArr = arr(req.query.isFamilyOptions || req.query['isFamilyOptions[]']).filter(Boolean)
  const hasOvernightArr = arr(req.query.hasOvernightOptions || req.query['hasOvernightOptions[]']).filter(Boolean)

  const where = { isActive: true }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { shortDescription: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (seasonsArr.length) {
    where.season = { in: seasonsArr }
  }
  if (transportArr.length) {
    where.transport = { in: transportArr }
  }
  if (durationArr.length) {
    where.duration = { in: durationArr }
  }
  if (difficultyArr.length) {
    const nums = difficultyArr.map((d) => parseInt(d, 10)).filter((n) => Number.isFinite(n))
    if (nums.length) where.difficulty = { in: nums }
  }
  if (distanceArr.length) {
    const distanceOr = []
    for (const opt of distanceArr) {
      const s = String(opt).trim()
      if (s === 'до 10 км') distanceOr.push({ distance: { lte: 10 } })
      else if (s === '10–50 км') distanceOr.push({ distance: { gte: 10, lte: 50 } })
      else if (s === '50–100 км') distanceOr.push({ distance: { gte: 50, lte: 100 } })
      else if (s === '100+ км') distanceOr.push({ distance: { gte: 100 } })
    }
    if (distanceOr.length) {
      where.AND = (where.AND || []).concat([{ OR: distanceOr }])
    }
  }
  if (elevationArr.length) {
    const elevationOr = []
    for (const opt of elevationArr) {
      const s = String(opt).trim()
      if (s === 'до 500 м') elevationOr.push({ elevationGain: { lte: 500 } })
      else if (s === '500–1000 м') elevationOr.push({ elevationGain: { gte: 500, lte: 1000 } })
      else if (s === '1000+ м') elevationOr.push({ elevationGain: { gte: 1000 } })
    }
    if (elevationOr.length) {
      where.AND = (where.AND || []).concat([{ OR: elevationOr }])
    }
  }
  if (isFamilyArr.length) {
    where.isFamily = true
  }
  if (hasOvernightArr.length) {
    where.hasOvernight = true
  }

  // Получаем конфиг для extraGroups
  const config = await prisma.routeFilterConfig.findUnique({
    where: { id: 'default' },
    select: { extraGroups: true },
  })
  const extraGroups = getExtraGroupsFromConfig(config)

  // Обработка extraGroups фильтров через customFilters
  const extraFilters = []
  for (const g of extraGroups) {
    if (!g.key) continue
    const valuesArr = arr(req.query[g.key] || req.query[`${g.key}[]`]).filter(Boolean)
    if (valuesArr.length > 0) {
      // Фильтруем маршруты, у которых в customFilters есть значения для этого ключа
      // Для MongoDB Prisma используем path и array_contains (принимает массив)
      extraFilters.push({
        customFilters: {
          path: [g.key],
          array_contains: valuesArr,
        },
      })
    }
  }
  if (extraFilters.length > 0) {
    where.AND = (where.AND || []).concat(extraFilters)
  }

  // Определяем сортировку
  let orderBy
  if (sortBy === 'difficulty') {
    orderBy = { difficulty: 'asc' }
  } else if (sortBy === 'popularity') {
    orderBy = { uniqueViewsCount: 'desc' }
  } else {
    orderBy = { createdAt: 'desc' }
  }

  const [items, total] = await Promise.all([
    prisma.route.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        points: { orderBy: { order: 'asc' } },
      },
    }),
    prisma.route.count({ where }),
  ])

  const placeIdsList = items.flatMap((r) => Array.isArray(r.placeIds) ? r.placeIds : [])
  const uniquePlaceIds = [...new Set(placeIdsList)]
  const placesMap = uniquePlaceIds.length
    ? Object.fromEntries(
        (await prisma.place.findMany({
          where: { id: { in: uniquePlaceIds }, isActive: true },
          select: { id: true, title: true, slug: true },
        })).map((p) => [p.id, p])
      )
    : {}

  const normalized = items.map((route) => {
    const placeIds = Array.isArray(route.placeIds) ? route.placeIds : []
    const places = placeIds.map((id) => placesMap[id]).filter(Boolean)
    return {
      ...route,
      placeIds,
      nearbyPlaceIds: Array.isArray(route.nearbyPlaceIds) ? route.nearbyPlaceIds : [],
      guideIds: Array.isArray(route.guideIds) ? route.guideIds : [],
      similarRouteIds: Array.isArray(route.similarRouteIds) ? route.similarRouteIds : [],
      places,
    }
  })

  res.json({
    items: normalized,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  })
})

// @desc    Get route by id or slug (public, no auth)
// @route   GET /api/routes/:idOrSlug
export const getRouteByIdOrSlugPublic = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params
  const isObjectId = /^[a-f\d]{24}$/i.test(idOrSlug)

  const route = await prisma.route.findFirst({
    where: isObjectId
      ? { id: idOrSlug, isActive: true }
      : { slug: idOrSlug, isActive: true },
    include: {
      points: { orderBy: { order: 'asc' } },
      reviews: {
        where: { status: 'approved' },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!route) {
    res.status(404)
    throw new Error('Маршрут не найден')
  }

  // Отслеживание уникальных просмотров
  if (req.visitorId) {
    try {
      // Ищем существующий просмотр
      const whereCondition = {
        entityType: 'route',
        entityId: route.id,
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
            entityType: 'route',
            entityId: route.id,
            userId: req.userId || null,
            visitorId: req.userId ? null : req.visitorId,
          },
        })

        // Увеличиваем счетчик уникальных просмотров
        try {
          const currentRoute = await prisma.route.findUnique({
            where: { id: route.id },
            select: { uniqueViewsCount: true },
          })
          
          const currentCount = currentRoute?.uniqueViewsCount ?? 0
          const newCount = currentCount + 1
          const updatedRoute = await prisma.route.update({
            where: { id: route.id },
            data: {
              uniqueViewsCount: newCount,
            },
          })

          route.uniqueViewsCount = updatedRoute.uniqueViewsCount ?? newCount
        } catch (updateError) {
          console.error('[View Tracking] Error updating route uniqueViewsCount:', updateError.message)
          try {
            const currentRoute = await prisma.route.findUnique({
              where: { id: route.id },
              select: { uniqueViewsCount: true },
            })
            const currentCount = currentRoute?.uniqueViewsCount ?? 0
            const newCount = currentCount + 1
            const directUpdate = await prisma.route.update({
              where: { id: route.id },
              data: {
                uniqueViewsCount: newCount,
              },
            })
            route.uniqueViewsCount = directUpdate.uniqueViewsCount ?? newCount
          } catch (directError) {
            console.error('[View Tracking] Error in direct update:', directError.message)
          }
        }
      } else {
        // Получаем актуальный счетчик из базы
        const currentRoute = await prisma.route.findUnique({
          where: { id: route.id },
          select: { uniqueViewsCount: true },
        })
        
        route.uniqueViewsCount = currentRoute?.uniqueViewsCount ?? 0
      }
    } catch (error) {
      console.error('[View Tracking] Error tracking route view:', error.message)
    }
  }

  const placeIds = Array.isArray(route.placeIds) ? route.placeIds : []
  const places = placeIds.length
    ? (await prisma.place.findMany({
        where: { id: { in: placeIds }, isActive: true },
        select: { id: true, title: true, slug: true, location: true, latitude: true, longitude: true, image: true, images: true, description: true, rating: true, reviewsCount: true },
      })).sort((a, b) => placeIds.indexOf(a.id) - placeIds.indexOf(b.id))
    : []

  const guideIds = Array.isArray(route.guideIds) ? route.guideIds : []
  const guides = guideIds.length
    ? (await prisma.service.findMany({
        where: { id: { in: guideIds }, isActive: true },
        select: { id: true, title: true, slug: true, images: true, rating: true, reviewsCount: true, isVerified: true },
      })).sort((a, b) => guideIds.indexOf(a.id) - guideIds.indexOf(b.id))
    : []

  const nearbyPlaceIds = Array.isArray(route.nearbyPlaceIds) ? route.nearbyPlaceIds : []
  const nearbyPlaces = nearbyPlaceIds.length
    ? (await prisma.place.findMany({
        where: { id: { in: nearbyPlaceIds }, isActive: true },
        select: { id: true, title: true, slug: true, location: true, image: true, images: true, shortDescription: true, rating: true, reviewsCount: true },
      })).sort((a, b) => nearbyPlaceIds.indexOf(a.id) - nearbyPlaceIds.indexOf(b.id))
    : []

  const normalized = {
    ...route,
    placeIds,
    nearbyPlaceIds,
    guideIds,
    similarRouteIds: Array.isArray(route.similarRouteIds) ? route.similarRouteIds : [],
    places,
    guides,
    nearbyPlaces,
  }
  res.json(normalized)
})

// @desc    Create review for route (public, no auth) — статус pending, модерация в админке
// @route   POST /api/routes/:routeId/reviews
export const createRouteReview = asyncHandler(async (req, res) => {
  const { routeId } = req.params
  const { authorName, rating, text, authorAvatar } = req.body || {}

  if (!authorName || !authorName.trim()) {
    res.status(400)
    throw new Error('Укажите имя')
  }
  const ratingNum = parseInt(rating, 10)
  if (Number.isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    res.status(400)
    throw new Error('Рейтинг должен быть от 1 до 5')
  }
  if (!text || !text.trim()) {
    res.status(400)
    throw new Error('Напишите текст отзыва')
  }

  const isObjectId = /^[a-f\d]{24}$/i.test(routeId)
  const route = await prisma.route.findFirst({
    where: isObjectId ? { id: routeId, isActive: true } : { slug: routeId, isActive: true },
    select: { id: true, title: true },
  })

  if (!route) {
    res.status(404)
    throw new Error('Маршрут не найден')
  }

  const review = await prisma.review.create({
    data: {
      authorName: authorName.trim(),
      authorAvatar: authorAvatar && String(authorAvatar).trim() ? String(authorAvatar).trim() : null,
      rating: ratingNum,
      text: text.trim(),
      status: 'pending',
      entityType: 'route',
      entityId: route.id,
      entityTitle: route.title,
      routeId: route.id,
    },
  })

  res.status(201).json(review)
})
