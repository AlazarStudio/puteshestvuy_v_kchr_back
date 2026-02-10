import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

const DEFAULT_FILTERS = {
  directions: ['Архыз', 'Домбай', 'Джылы-Суу', 'Медовые водопады'],
  seasons: ['зима', 'весна', 'лето', 'осень'],
  objectTypes: ['заповедник', 'горы', 'озера/реки', 'ледники', 'водопады', 'ущелья', 'пещеры'],
  accessibility: ['только пешком', 'на машине'],
}

function getExtraGroupsFromConfig(config) {
  const raw = config?.extraGroups
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr.filter((g) => g && typeof g.key === 'string' && g.key.trim()).map((g) => ({
    key: String(g.key).trim(),
    label: typeof g.label === 'string' ? g.label.trim() || g.key : String(g.key),
    values: Array.isArray(g.values) ? g.values.filter((v) => typeof v === 'string' && v.trim()) : [],
  }))
}

// @desc    Get place filters config (public, no auth) — для фильтра на сайте
// @route   GET /api/places/filters
export const getPlaceFiltersPublic = asyncHandler(async (req, res) => {
  const config = await prisma.placeFilterConfig.findUnique({
    where: { id: 'default' },
  })
  if (!config) {
    return res.json({ ...DEFAULT_FILTERS, extraGroups: [] })
  }
  res.json({
    directions: config.directions ?? [],
    seasons: config.seasons ?? [],
    objectTypes: config.objectTypes ?? [],
    accessibility: config.accessibility ?? [],
    extraGroups: getExtraGroupsFromConfig(config),
  })
})

// @desc    Get active places (public, no auth)
// @route   GET /api/places
export const getPlacesPublic = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = Math.min(parseInt(req.query.limit) || 12, 100)
  const skip = (page - 1) * limit
  const search = (req.query.search || '').trim()
  const byLocation = (req.query.byLocation || '').trim()

  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])
  const directionsArr = arr(req.query.directions || req.query['directions[]']).filter(Boolean)
  const seasonsArr = arr(req.query.seasons || req.query['seasons[]']).filter(Boolean)
  const objectTypesArr = arr(req.query.objectTypes || req.query['objectTypes[]']).filter(Boolean)
  const accessibilityArr = arr(req.query.accessibility || req.query['accessibility[]']).filter(Boolean)

  const where = { isActive: true }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (byLocation) {
    where.location = { contains: byLocation, mode: 'insensitive' }
  }
  if (directionsArr.length) {
    where.directions = { hasSome: directionsArr }
  }
  if (seasonsArr.length) {
    where.seasons = { hasSome: seasonsArr }
  }
  if (objectTypesArr.length) {
    where.objectTypes = { hasSome: objectTypesArr }
  }
  if (accessibilityArr.length) {
    where.accessibility = { hasSome: accessibilityArr }
  }

  const [items, total] = await Promise.all([
    prisma.place.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.place.count({ where }),
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
      pages: Math.ceil(total / limit) || 1,
    },
  })
})

// @desc    Get place by id or slug (public, no auth)
// @route   GET /api/places/:idOrSlug
export const getPlaceByIdOrSlugPublic = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params

  const isObjectId = /^[a-f\d]{24}$/i.test(idOrSlug)
  const place = await prisma.place.findFirst({
    where: isObjectId ? { id: idOrSlug, isActive: true } : { slug: idOrSlug, isActive: true },
    include: {
      reviews: {
        where: { status: 'approved' },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!place) {
    res.status(404)
    throw new Error('Место не найдено')
  }

  const nearbyPlaceIds = Array.isArray(place.nearbyPlaceIds) ? place.nearbyPlaceIds : []
  const nearbyPlaces = nearbyPlaceIds.length
    ? await prisma.place.findMany({
        where: { id: { in: nearbyPlaceIds }, isActive: true },
        select: {
          id: true,
          title: true,
          slug: true,
          location: true,
          shortDescription: true,
          rating: true,
          reviewsCount: true,
          image: true,
          images: true,
        },
      })
    : []

  const safePlace = {
    ...place,
    image: place.image || place.images?.[0] || null,
    nearbyPlaceIds,
    nearbyPlaces: nearbyPlaces.map((p) => ({
      ...p,
      image: p.image || p.images?.[0] || null,
    })),
  }

  res.json(safePlace)
})

// @desc    Create review for place (public, no auth) — статус pending, модерация в админке
// @route   POST /api/places/:placeId/reviews
export const createPlaceReview = asyncHandler(async (req, res) => {
  const { placeId } = req.params
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

  const isObjectId = /^[a-f\d]{24}$/i.test(placeId)
  const place = await prisma.place.findFirst({
    where: isObjectId ? { id: placeId, isActive: true } : { slug: placeId, isActive: true },
    select: { id: true, title: true },
  })

  if (!place) {
    res.status(404)
    throw new Error('Место не найдено')
  }

  const review = await prisma.review.create({
    data: {
      authorName: authorName.trim(),
      authorAvatar: authorAvatar && String(authorAvatar).trim() ? String(authorAvatar).trim() : null,
      rating: ratingNum,
      text: text.trim(),
      status: 'pending',
      entityType: 'place',
      entityId: place.id,
      entityTitle: place.title,
      placeId: place.id,
    },
  })

  res.status(201).json(review)
})
