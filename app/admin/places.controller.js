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

  const where = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}

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

  res.json(place)
})

// @desc    Create place
// @route   POST /api/admin/places
// @access  Admin
export const createPlace = asyncHandler(async (req, res) => {
  const {
    title,
    location,
    shortDescription,
    description,
    howToGet,
    audioGuide,
    video,
    isActive,
    images,
  } = req.body

  if (!title) {
    res.status(400)
    throw new Error('Название обязательно')
  }

  const slug = generateSlug(title) + '-' + Date.now()

  const place = await prisma.place.create({
    data: {
      title,
      slug,
      location,
      shortDescription,
      description,
      howToGet,
      audioGuide,
      video,
      isActive: isActive !== false,
      images: images || [],
    },
  })

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
    shortDescription,
    description,
    howToGet,
    audioGuide,
    video,
    isActive,
    images,
  } = req.body

  const slug = title !== existing.title 
    ? generateSlug(title) + '-' + Date.now() 
    : existing.slug

  const place = await prisma.place.update({
    where: { id: req.params.id },
    data: {
      title,
      slug,
      location,
      shortDescription,
      description,
      howToGet,
      audioGuide,
      video,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      images: images || undefined,
    },
  })

  res.json(place)
})

// @desc    Delete place
// @route   DELETE /api/admin/places/:id
// @access  Admin
export const deletePlace = asyncHandler(async (req, res) => {
  const existing = await prisma.place.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Место не найдено')
  }

  await prisma.place.delete({
    where: { id: req.params.id },
  })

  res.json({ message: 'Место удалено' })
})
