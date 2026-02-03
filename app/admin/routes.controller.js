import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

const generateSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[а-яё]/g, (char) => {
      const map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
        'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
      }
      return map[char] || char
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// @desc    Get routes with pagination
// @route   GET /api/admin/routes
// @access  Admin
export const getRoutes = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit
  const search = req.query.search || ''

  const where = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}

  const [items, total] = await Promise.all([
    prisma.route.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        points: { orderBy: { order: 'asc' } },
      },
    }),
    prisma.route.count({ where }),
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

// @desc    Get route by id
// @route   GET /api/admin/routes/:id
// @access  Admin
export const getRouteById = asyncHandler(async (req, res) => {
  const route = await prisma.route.findUnique({
    where: { id: req.params.id },
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

  // Нормализуем ответ: старые документы в БД могут не иметь новых полей
  const normalized = {
    ...route,
    placeIds: Array.isArray(route.placeIds) ? route.placeIds : [],
    nearbyPlaceIds: Array.isArray(route.nearbyPlaceIds) ? route.nearbyPlaceIds : [],
    guideIds: Array.isArray(route.guideIds) ? route.guideIds : [],
    similarRouteIds: Array.isArray(route.similarRouteIds) ? route.similarRouteIds : [],
  }
  res.json(normalized)
})

// @desc    Create route
// @route   POST /api/admin/routes
// @access  Admin
export const createRoute = asyncHandler(async (req, res) => {
  const {
    title,
    shortDescription,
    description,
    season,
    distance,
    duration,
    difficulty,
    transport,
    customFilters,
    isFamily,
    hasOvernight,
    elevationGain,
    whatToBring,
    importantInfo,
    mapUrl,
    isActive,
    images,
    points,
    placeIds,
    nearbyPlaceIds,
    guideIds,
    similarRouteIds,
  } = req.body

  if (!title) {
    res.status(400)
    throw new Error('Название обязательно')
  }

  const slug = generateSlug(title) + '-' + Date.now()

  const route = await prisma.route.create({
    data: {
      title,
      slug,
      shortDescription,
      description,
      season,
      distance: distance ? parseFloat(distance) : null,
      duration,
      difficulty: difficulty ? parseInt(difficulty) : 3,
      transport,
      isFamily: Boolean(isFamily),
      hasOvernight: Boolean(hasOvernight),
      elevationGain: elevationGain ? parseFloat(elevationGain) : null,
      whatToBring,
      importantInfo,
      mapUrl: mapUrl ?? null,
      isActive: isActive !== false,
      images: images || [],
      placeIds: placeIds || [],
      nearbyPlaceIds: nearbyPlaceIds || [],
      guideIds: guideIds || [],
      similarRouteIds: similarRouteIds || [],
      customFilters: customFilters && typeof customFilters === 'object' ? customFilters : null,
      points: points
        ? {
            create: points.map((point, index) => ({
              title: point.title,
              description: point.description,
              image: point.image,
              order: index,
            })),
          }
        : undefined,
    },
    include: { points: true },
  })

  // Синхрон: добавляем id маршрута в routeIds у выбранных гидов
  const guideIdsList = Array.isArray(guideIds) ? guideIds : []
  if (guideIdsList.length > 0) {
    await prisma.service.updateMany({
      where: { id: { in: guideIdsList }, category: 'Гид' },
      data: {
        routeIds: { push: route.id },
      },
    })
  }

  res.status(201).json(route)
})

// @desc    Update route
// @route   PUT /api/admin/routes/:id
// @access  Admin
export const updateRoute = asyncHandler(async (req, res) => {
  const existing = await prisma.route.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Маршрут не найден')
  }

  const body = req.body || {}
  const title = body.title !== undefined ? String(body.title) : existing.title
  const slug = title !== existing.title
    ? generateSlug(title) + '-' + Date.now()
    : existing.slug

  const updateData = {
    title,
    slug,
    shortDescription: body.shortDescription !== undefined ? (body.shortDescription ?? null) : existing.shortDescription,
    description: body.description !== undefined ? (body.description ?? null) : existing.description,
    season: body.season !== undefined ? (body.season ?? null) : existing.season,
    distance: body.distance !== undefined ? (body.distance != null && body.distance !== '' ? parseFloat(body.distance) || null : null) : existing.distance,
    duration: body.duration !== undefined ? (body.duration ?? null) : existing.duration,
    difficulty: body.difficulty !== undefined ? (parseInt(body.difficulty, 10) || 3) : existing.difficulty,
    transport: body.transport !== undefined ? (body.transport ?? null) : existing.transport,
    isFamily: body.isFamily !== undefined ? Boolean(body.isFamily) : existing.isFamily,
    hasOvernight: body.hasOvernight !== undefined ? Boolean(body.hasOvernight) : existing.hasOvernight,
    elevationGain: body.elevationGain !== undefined ? (body.elevationGain != null && body.elevationGain !== '' ? parseFloat(body.elevationGain) || null : null) : existing.elevationGain,
    whatToBring: body.whatToBring !== undefined ? (body.whatToBring ?? null) : existing.whatToBring,
    importantInfo: body.importantInfo !== undefined ? (body.importantInfo ?? null) : existing.importantInfo,
    mapUrl: body.mapUrl !== undefined ? (body.mapUrl ?? null) : existing.mapUrl,
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive,
    images: Array.isArray(body.images) ? body.images : (existing.images ?? []),
    placeIds: Array.isArray(body.placeIds) ? body.placeIds : (Array.isArray(existing.placeIds) ? existing.placeIds : []),
    nearbyPlaceIds: Array.isArray(body.nearbyPlaceIds) ? body.nearbyPlaceIds : (Array.isArray(existing.nearbyPlaceIds) ? existing.nearbyPlaceIds : []),
    guideIds: Array.isArray(body.guideIds) ? body.guideIds : (Array.isArray(existing.guideIds) ? existing.guideIds : []),
    similarRouteIds: Array.isArray(body.similarRouteIds) ? body.similarRouteIds : (Array.isArray(existing.similarRouteIds) ? existing.similarRouteIds : []),
    customFilters: body.customFilters !== undefined ? (body.customFilters && typeof body.customFilters === 'object' ? body.customFilters : null) : existing.customFilters,
  }

  await prisma.route.update({
    where: { id: req.params.id },
    data: updateData,
  })

  const points = body.points
  if (points !== undefined) {
    await prisma.routePoint.deleteMany({ where: { routeId: req.params.id } })
    if (Array.isArray(points) && points.length > 0) {
      await prisma.routePoint.createMany({
        data: points.map((point, index) => ({
          routeId: req.params.id,
          title: point.title ?? '',
          description: point.description ?? null,
          image: point.image ?? null,
          order: index,
        })),
      })
    }
  }

  const route = await prisma.route.findUnique({
    where: { id: req.params.id },
    include: { points: { orderBy: { order: 'asc' } } },
  })

  // Синхрон гидов: у гидов из нового guideIds добавляем route.id в routeIds; у гидов, убранных из списка, — удаляем
  const newGuideIds = Array.isArray(updateData.guideIds) ? updateData.guideIds : []
  const oldGuideIds = Array.isArray(existing.guideIds) ? existing.guideIds : []
  const toAdd = newGuideIds.filter((id) => !oldGuideIds.includes(id))
  const toRemove = oldGuideIds.filter((id) => !newGuideIds.includes(id))
  const routeId = req.params.id

  if (toAdd.length > 0) {
    await prisma.service.updateMany({
      where: { id: { in: toAdd }, category: 'Гид' },
      data: { routeIds: { push: routeId } },
    })
  }
  if (toRemove.length > 0) {
    for (const serviceId of toRemove) {
      const svc = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { routeIds: true },
      })
      if (svc && Array.isArray(svc.routeIds)) {
        const next = svc.routeIds.filter((id) => id !== routeId)
        await prisma.service.update({
          where: { id: serviceId },
          data: { routeIds: next },
        })
      }
    }
  }

  const normalized = {
    ...route,
    placeIds: Array.isArray(route.placeIds) ? route.placeIds : [],
    nearbyPlaceIds: Array.isArray(route.nearbyPlaceIds) ? route.nearbyPlaceIds : [],
    guideIds: Array.isArray(route.guideIds) ? route.guideIds : [],
    similarRouteIds: Array.isArray(route.similarRouteIds) ? route.similarRouteIds : [],
  }
  res.json(normalized)
})

// @desc    Delete route
// @route   DELETE /api/admin/routes/:id
// @access  Admin
export const deleteRoute = asyncHandler(async (req, res) => {
  const existing = await prisma.route.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Маршрут не найден')
  }

  const routeId = req.params.id
  await prisma.route.delete({
    where: { id: routeId },
  })

  // Убираем id маршрута из routeIds у всех гидов
  const guidesWithRoute = await prisma.service.findMany({
    where: { category: 'Гид', routeIds: { hasSome: [routeId] } },
    select: { id: true, routeIds: true },
  })
  for (const svc of guidesWithRoute) {
    const next = (svc.routeIds || []).filter((id) => id !== routeId)
    await prisma.service.update({
      where: { id: svc.id },
      data: { routeIds: next },
    })
  }

  res.json({ message: 'Маршрут удалён' })
})
