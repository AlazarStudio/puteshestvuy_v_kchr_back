import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'

const generateSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[а-яё]/g, (char) => {
      const map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
        'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
      }
      return map[char] || char
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// @desc    Get all suggestions with pagination
// @route   GET /api/admin/suggestions
export const getSuggestions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 20
  const skip = (page - 1) * limit
  const status = req.query.status || undefined

  const where = status ? { status } : {}

  const [items, total] = await Promise.all([
    prisma.placeSuggestion.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.placeSuggestion.count({ where }),
  ])

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
})

// @desc    Get pending suggestions count
// @route   GET /api/admin/suggestions/pending-count
export const getPendingCount = asyncHandler(async (req, res) => {
  const count = await prisma.placeSuggestion.count({ where: { status: { in: ['pending', 'in_review'] } } })
  res.json({ count })
})

// @desc    Get suggestion by id
// @route   GET /api/admin/suggestions/:id
export const getSuggestionById = asyncHandler(async (req, res) => {
  const suggestion = await prisma.placeSuggestion.findUnique({
    where: { id: req.params.id },
  })
  if (!suggestion) {
    res.status(404)
    throw new Error('Заявка не найдена')
  }
  res.json(suggestion)
})

// @desc    Update suggestion (fields or status/comment)
// @route   PUT /api/admin/suggestions/:id
export const updateSuggestion = asyncHandler(async (req, res) => {
  const existing = await prisma.placeSuggestion.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404)
    throw new Error('Заявка не найдена')
  }

  const allowed = [
    'status', 'adminComment',
    'title', 'location', 'latitude', 'longitude',
    'shortDescription', 'description', 'howToGet', 'importantInfo',
    'mapUrl', 'audioGuide', 'video', 'image', 'sliderVideo',
    'images', 'directions', 'seasons', 'objectTypes', 'accessibility',
  ]

  const data = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      data[key] = req.body[key]
    }
  }

  const updated = await prisma.placeSuggestion.update({
    where: { id: req.params.id },
    data,
  })
  res.json(updated)
})

// @desc    Approve suggestion — creates a draft Place and returns its id
// @route   POST /api/admin/suggestions/:id/approve
export const approveSuggestion = asyncHandler(async (req, res) => {
  const suggestion = await prisma.placeSuggestion.findUnique({
    where: { id: req.params.id },
  })
  if (!suggestion) {
    res.status(404)
    throw new Error('Заявка не найдена')
  }

  const slug = generateSlug(suggestion.title) + '-' + Date.now()

  const place = await prisma.place.create({
    data: {
      title: suggestion.title,
      slug,
      location: suggestion.location,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      shortDescription: suggestion.shortDescription,
      description: suggestion.description,
      howToGet: suggestion.howToGet,
      importantInfo: suggestion.importantInfo,
      mapUrl: suggestion.mapUrl,
      audioGuide: suggestion.audioGuide,
      video: suggestion.video,
      image: suggestion.image,
      sliderVideo: suggestion.sliderVideo,
      images: suggestion.images,
      directions: suggestion.directions,
      seasons: suggestion.seasons,
      objectTypes: suggestion.objectTypes,
      accessibility: suggestion.accessibility,
      isActive: false,
      nearbyPlaceIds: [],
    },
  })

  await prisma.placeSuggestion.update({
    where: { id: req.params.id },
    data: { status: 'in_review', approvedPlaceId: place.id },
  })

  res.json({ placeId: place.id })
})

// @desc    Confirm approve suggestion — sets status to approved
// @route   POST /api/admin/suggestions/:id/confirm-approve
export const confirmApproveSuggestion = asyncHandler(async (req, res) => {
  const suggestion = await prisma.placeSuggestion.findUnique({
    where: { id: req.params.id },
  })
  if (!suggestion) {
    res.status(404)
    throw new Error('Заявка не найдена')
  }
  const updated = await prisma.placeSuggestion.update({
    where: { id: req.params.id },
    data: { status: 'approved' },
  })
  res.json(updated)
})

// @desc    Delete suggestion
// @route   DELETE /api/admin/suggestions/:id
export const deleteSuggestion = asyncHandler(async (req, res) => {
  const existing = await prisma.placeSuggestion.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404)
    throw new Error('Заявка не найдена')
  }
  await prisma.placeSuggestion.delete({ where: { id: req.params.id } })
  res.json({ message: 'Заявка удалена' })
})
