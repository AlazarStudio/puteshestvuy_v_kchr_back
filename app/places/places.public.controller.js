import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

// @desc    Get active places (public, no auth)
// @route   GET /api/places
export const getPlacesPublic = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = Math.min(parseInt(req.query.limit) || 12, 100)
  const skip = (page - 1) * limit
  const search = (req.query.search || '').trim()
  const byLocation = (req.query.byLocation || '').trim()

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
      image: item.images?.[0] || null,
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
          images: true,
        },
      })
    : []

  const safePlace = {
    ...place,
    nearbyPlaceIds,
    nearbyPlaces: nearbyPlaces.map((p) => ({
      ...p,
      image: p.images?.[0] || null,
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
