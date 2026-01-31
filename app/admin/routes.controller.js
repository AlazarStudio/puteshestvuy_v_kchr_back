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

  res.json(route)
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
      mapUrl,
      isActive: isActive !== false,
      images: images || [],
      placeIds: placeIds || [],
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
  } = req.body

  // Обновляем slug если изменился title
  const slug = title !== existing.title 
    ? generateSlug(title) + '-' + Date.now() 
    : existing.slug

  await prisma.route.update({
    where: { id: req.params.id },
    data: {
      title,
      slug,
      shortDescription,
      description,
      season,
      distance: distance !== undefined ? parseFloat(distance) || null : undefined,
      duration,
      difficulty: difficulty !== undefined ? parseInt(difficulty) || 3 : undefined,
      transport,
      isFamily: isFamily !== undefined ? Boolean(isFamily) : undefined,
      hasOvernight: hasOvernight !== undefined ? Boolean(hasOvernight) : undefined,
      elevationGain: elevationGain !== undefined ? parseFloat(elevationGain) || null : undefined,
      whatToBring,
      importantInfo,
      mapUrl,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      images: images || undefined,
      placeIds: placeIds || undefined,
      customFilters: customFilters !== undefined ? (customFilters && typeof customFilters === 'object' ? customFilters : null) : undefined,
    },
  })

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

  res.json(route)
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

  await prisma.route.delete({
    where: { id: req.params.id },
  })

  res.json({ message: 'Маршрут удалён' })
})
