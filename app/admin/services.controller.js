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

// @desc    Get services with pagination
// @route   GET /api/admin/services
// @access  Admin
export const getServices = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit
  const search = req.query.search || ''

  const where = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}

  const [items, total] = await Promise.all([
    prisma.service.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.service.count({ where }),
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

// @desc    Get service by id
// @route   GET /api/admin/services/:id
// @access  Admin
export const getServiceById = asyncHandler(async (req, res) => {
  const service = await prisma.service.findUnique({
    where: { id: req.params.id },
    include: {
      reviews: {
        where: { status: 'approved' },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!service) {
    res.status(404)
    throw new Error('Услуга не найдена')
  }

  res.json(service)
})

// @desc    Create service
// @route   POST /api/admin/services
// @access  Admin
export const createService = asyncHandler(async (req, res) => {
  const {
    title,
    category,
    shortDescription,
    description,
    phone,
    email,
    telegram,
    address,
    latitude,
    longitude,
    isVerified,
    isActive,
    images,
    certificates,
    prices,
    data,
  } = req.body

  if (!title) {
    res.status(400)
    throw new Error('Название обязательно')
  }

  const slug = generateSlug(title) + '-' + Date.now()

  const service = await prisma.service.create({
    data: {
      title,
      slug,
      category,
      shortDescription,
      description,
      phone,
      email,
      telegram,
      address,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      isVerified: Boolean(isVerified),
      isActive: isActive !== false,
      images: images || [],
      certificates: certificates || [],
      prices: prices || [],
      data: data != null && typeof data === 'object' ? data : undefined,
    },
  })

  res.status(201).json(service)
})

// @desc    Update service (поддерживает частичное обновление, в т.ч. только isActive)
// @route   PUT /api/admin/services/:id
// @access  Admin
export const updateService = asyncHandler(async (req, res) => {
  const existing = await prisma.service.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Услуга не найдена')
  }

  const updateData = {}

  if (req.body.title !== undefined) {
    updateData.title = req.body.title
    updateData.slug = req.body.title !== existing.title
      ? generateSlug(req.body.title) + '-' + Date.now()
      : existing.slug
  }
  if (req.body.category !== undefined) updateData.category = req.body.category
  if (req.body.shortDescription !== undefined) updateData.shortDescription = req.body.shortDescription
  if (req.body.description !== undefined) updateData.description = req.body.description
  if (req.body.phone !== undefined) updateData.phone = req.body.phone
  if (req.body.email !== undefined) updateData.email = req.body.email
  if (req.body.telegram !== undefined) updateData.telegram = req.body.telegram
  if (req.body.address !== undefined) updateData.address = req.body.address
  if (req.body.latitude !== undefined) updateData.latitude = req.body.latitude != null ? Number(req.body.latitude) : null
  if (req.body.longitude !== undefined) updateData.longitude = req.body.longitude != null ? Number(req.body.longitude) : null
  if (req.body.isVerified !== undefined) updateData.isVerified = Boolean(req.body.isVerified)
  if (req.body.isActive !== undefined) updateData.isActive = Boolean(req.body.isActive)
  if (req.body.images !== undefined) updateData.images = req.body.images
  if (req.body.certificates !== undefined) updateData.certificates = req.body.certificates
  if (req.body.prices !== undefined) updateData.prices = req.body.prices
  if (req.body.data !== undefined) updateData.data = req.body.data != null && typeof req.body.data === 'object' ? req.body.data : null

  const service = await prisma.service.update({
    where: { id: req.params.id },
    data: updateData,
  })

  res.json(service)
})

// @desc    Delete service
// @route   DELETE /api/admin/services/:id
// @access  Admin
export const deleteService = asyncHandler(async (req, res) => {
  const existing = await prisma.service.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Услуга не найдена')
  }

  await prisma.service.delete({
    where: { id: req.params.id },
  })

  res.json({ message: 'Услуга удалена' })
})
