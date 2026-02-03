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

// @desc    Update service
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

  const {
    title,
    category,
    shortDescription,
    description,
    phone,
    email,
    telegram,
    address,
    isVerified,
    isActive,
    images,
    certificates,
    prices,
    data,
  } = req.body

  const slug = title !== existing.title 
    ? generateSlug(title) + '-' + Date.now() 
    : existing.slug

  const service = await prisma.service.update({
    where: { id: req.params.id },
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
      isVerified: isVerified !== undefined ? Boolean(isVerified) : undefined,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      images: images || undefined,
      certificates: certificates || undefined,
      prices: prices || undefined,
      data: data !== undefined ? (data != null && typeof data === 'object' ? data : null) : undefined,
    },
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
