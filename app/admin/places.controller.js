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

// @desc    Get places with pagination
// @route   GET /api/admin/places
// @access  Admin
export const getPlaces = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit
  const search = req.query.search || ''
  const byLocation = (req.query.byLocation || '').trim()

  const where = {}
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
    items: items.map(item => ({
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

// @desc    Get place by id
// @route   GET /api/admin/places/:id
// @access  Admin
export const getPlaceById = asyncHandler(async (req, res) => {
  const place = await prisma.place.findUnique({
    where: { id: req.params.id },
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

  const safePlace = {
    ...place,
    nearbyPlaceIds: Array.isArray(place.nearbyPlaceIds) ? place.nearbyPlaceIds : [],
  }
  res.json(safePlace)
})

// Синхронизирует «места рядом» в обе стороны: у каждого из nearbyIds добавляем currentPlaceId в их nearbyPlaceIds
async function syncNearbyPlaceIdsBidirectional(currentPlaceId, newNearbyIds, oldNearbyIds = []) {
  const newSet = new Set(Array.isArray(newNearbyIds) ? newNearbyIds : [])
  const oldSet = new Set(Array.isArray(oldNearbyIds) ? oldNearbyIds : [])

  for (const otherId of newSet) {
    if (otherId === currentPlaceId) continue
    const other = await prisma.place.findUnique({
      where: { id: otherId },
      select: { nearbyPlaceIds: true },
    })
    if (!other) continue
    const ids = Array.isArray(other.nearbyPlaceIds) ? other.nearbyPlaceIds : []
    if (ids.includes(currentPlaceId)) continue
    await prisma.place.update({
      where: { id: otherId },
      data: { nearbyPlaceIds: [...ids, currentPlaceId] },
    })
  }

  for (const otherId of oldSet) {
    if (newSet.has(otherId)) continue
    const other = await prisma.place.findUnique({
      where: { id: otherId },
      select: { nearbyPlaceIds: true },
    })
    if (!other) continue
    const ids = Array.isArray(other.nearbyPlaceIds) ? other.nearbyPlaceIds : []
    const filtered = ids.filter((id) => id !== currentPlaceId)
    if (filtered.length === ids.length) continue
    await prisma.place.update({
      where: { id: otherId },
      data: { nearbyPlaceIds: filtered },
    })
  }
}

// @desc    Create place
// @route   POST /api/admin/places
// @access  Admin
export const createPlace = asyncHandler(async (req, res) => {
  const {
    title,
    location,
    latitude,
    longitude,
    shortDescription,
    description,
    howToGet,
    mapUrl,
    audioGuide,
    video,
    isActive,
    image,
    sliderVideo,
    images,
    directions,
    seasons,
    objectTypes,
    accessibility,
    nearbyPlaceIds,
  } = req.body

  if (!title) {
    res.status(400)
    throw new Error('Название обязательно')
  }

  const slug = generateSlug(title) + '-' + Date.now()
  const nearby = nearbyPlaceIds || []

  const place = await prisma.place.create({
    data: {
      title,
      slug,
      location,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      shortDescription,
      description,
      howToGet,
      mapUrl,
      audioGuide,
      video,
      isActive: isActive !== false,
      image: image || null,
      sliderVideo: sliderVideo || null,
      images: images || [],
      directions: Array.isArray(directions) ? directions : [],
      seasons: Array.isArray(seasons) ? seasons : [],
      objectTypes: Array.isArray(objectTypes) ? objectTypes : [],
      accessibility: Array.isArray(accessibility) ? accessibility : [],
      nearbyPlaceIds: nearby,
    },
  })

  await syncNearbyPlaceIdsBidirectional(place.id, nearby, [])

  res.status(201).json(place)
})

// @desc    Update place
// @route   PUT /api/admin/places/:id
// @access  Admin
export const updatePlace = asyncHandler(async (req, res) => {
  const existing = await prisma.place.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Место не найдено')
  }

  const {
    title,
    location,
    latitude,
    longitude,
    shortDescription,
    description,
    howToGet,
    mapUrl,
    audioGuide,
    video,
    isActive,
    image,
    sliderVideo,
    images,
    directions,
    seasons,
    objectTypes,
    accessibility,
    nearbyPlaceIds,
  } = req.body

  const data = {}
  if (title !== undefined) {
    data.title = title
    data.slug = title !== existing.title ? generateSlug(title) + '-' + Date.now() : existing.slug
  }
  if (location !== undefined) data.location = location
  if (latitude !== undefined) data.latitude = latitude != null ? Number(latitude) : null
  if (longitude !== undefined) data.longitude = longitude != null ? Number(longitude) : null
  if (shortDescription !== undefined) data.shortDescription = shortDescription
  if (description !== undefined) data.description = description
  if (howToGet !== undefined) data.howToGet = howToGet
  if (mapUrl !== undefined) data.mapUrl = mapUrl
  if (audioGuide !== undefined) data.audioGuide = audioGuide
  if (video !== undefined) data.video = video
  if (isActive !== undefined) data.isActive = Boolean(isActive)
  if (image !== undefined) data.image = image || null
  if (sliderVideo !== undefined) data.sliderVideo = sliderVideo || null
  if (images !== undefined) data.images = images
  if (directions !== undefined) data.directions = Array.isArray(directions) ? directions : []
  if (seasons !== undefined) data.seasons = Array.isArray(seasons) ? seasons : []
  if (objectTypes !== undefined) data.objectTypes = Array.isArray(objectTypes) ? objectTypes : []
  if (accessibility !== undefined) data.accessibility = Array.isArray(accessibility) ? accessibility : []
  if (nearbyPlaceIds !== undefined) data.nearbyPlaceIds = nearbyPlaceIds

  const newNearby = nearbyPlaceIds !== undefined ? nearbyPlaceIds : existing.nearbyPlaceIds
  const existingNearby = Array.isArray(existing.nearbyPlaceIds) ? existing.nearbyPlaceIds : []

  const place = await prisma.place.update({
    where: { id: req.params.id },
    data,
  })

  if (nearbyPlaceIds !== undefined) {
    await syncNearbyPlaceIdsBidirectional(req.params.id, newNearby, existingNearby)
  }

  res.json(place)
})

// @desc    Delete place
// @route   DELETE /api/admin/places/:id
// @access  Admin
export const deletePlace = asyncHandler(async (req, res) => {
  const placeId = req.params.id
  const existing = await prisma.place.findUnique({
    where: { id: placeId },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Место не найдено')
  }

  const nearbyIds = Array.isArray(existing.nearbyPlaceIds) ? existing.nearbyPlaceIds : []
  for (const otherId of nearbyIds) {
    const other = await prisma.place.findUnique({
      where: { id: otherId },
      select: { nearbyPlaceIds: true },
    })
    if (!other) continue
    const ids = Array.isArray(other.nearbyPlaceIds) ? other.nearbyPlaceIds : []
    const filtered = ids.filter((id) => id !== placeId)
    if (filtered.length === ids.length) continue
    await prisma.place.update({
      where: { id: otherId },
      data: { nearbyPlaceIds: filtered },
    })
  }

  await prisma.place.delete({
    where: { id: placeId },
  })

  res.json({ message: 'Место удалено' })
})
