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

// @desc    Get events with pagination
// @route   GET /api/admin/events
// @access  Admin
export const getEvents = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit
  const search = req.query.search || ''

  const where = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}

  const sortBy = req.query.sortBy || 'startAt'
  const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc'

  const sortFieldMap = {
    title: 'title',
    category: 'category',
    startAt: 'startAt',
    createdAt: 'createdAt',
    isActive: 'isActive',
  }

  const orderByField = sortFieldMap[sortBy] || 'startAt'
  const orderBy = { [orderByField]: sortOrder }

  const [items, total] = await Promise.all([
    prisma.event.findMany({ where, skip, take: limit, orderBy }),
    prisma.event.count({ where }),
  ])

  res.json({
    items: items.map((item) => ({
      ...item,
      image: item.image || item.images?.[0] || null,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
})

// @desc    Get event by id
// @route   GET /api/admin/events/:id
// @access  Admin
export const getEventById = asyncHandler(async (req, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } })

  if (!event) {
    res.status(404)
    throw new Error('Событие не найдено')
  }

  res.json(event)
})

// @desc    Create event
// @route   POST /api/admin/events
// @access  Admin
export const createEvent = asyncHandler(async (req, res) => {
  const {
    title, category, startAt, endAt, location, latitude, longitude, placeId,
    shortDescription, blocks, image, images, price, organizer, registrationUrl, isActive,
  } = req.body

  if (!title) {
    res.status(400)
    throw new Error('Заголовок обязателен')
  }
  if (!startAt) {
    res.status(400)
    throw new Error('Дата начала обязательна')
  }
  if (endAt && new Date(endAt) < new Date(startAt)) {
    res.status(400)
    throw new Error('Окончание события не может быть раньше начала')
  }

  const event = await prisma.event.create({
    data: {
      title,
      slug: generateSlug(title) + '-' + Date.now(),
      category: category || null,
      startAt: new Date(startAt),
      endAt: endAt ? new Date(endAt) : null,
      location: location || null,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      placeId: placeId || null,
      shortDescription: shortDescription || null,
      blocks: blocks || [],
      image: image || null,
      images: images || [],
      price: price || null,
      organizer: organizer || null,
      registrationUrl: registrationUrl || null,
      isActive: Boolean(isActive),
    },
  })

  res.status(201).json(event)
})

// @desc    Update event (частичное обновление, в т.ч. только isActive)
// @route   PUT /api/admin/events/:id
// @access  Admin
export const updateEvent = asyncHandler(async (req, res) => {
  const existing = await prisma.event.findUnique({ where: { id: req.params.id } })

  if (!existing) {
    res.status(404)
    throw new Error('Событие не найдено')
  }

  // Сравниваем итоговые края: при частичном обновлении недостающий берётся из сохранённой записи
  const nextStartAt = req.body.startAt !== undefined ? req.body.startAt : existing.startAt
  const nextEndAt = req.body.endAt !== undefined ? req.body.endAt : existing.endAt
  if (nextEndAt && nextStartAt && new Date(nextEndAt) < new Date(nextStartAt)) {
    res.status(400)
    throw new Error('Окончание события не может быть раньше начала')
  }

  const updateData = {}

  // Слаг генерируется один раз при создании и при переименовании НЕ меняется:
  // иначе уже разосланная ссылка на событие умирает молча, без редиректа
  if (req.body.title !== undefined) updateData.title = req.body.title
  if (req.body.category !== undefined) updateData.category = req.body.category || null
  if (req.body.startAt !== undefined) updateData.startAt = new Date(req.body.startAt)
  if (req.body.endAt !== undefined) updateData.endAt = req.body.endAt ? new Date(req.body.endAt) : null
  if (req.body.location !== undefined) updateData.location = req.body.location || null
  if (req.body.latitude !== undefined) updateData.latitude = req.body.latitude != null ? Number(req.body.latitude) : null
  if (req.body.longitude !== undefined) updateData.longitude = req.body.longitude != null ? Number(req.body.longitude) : null
  if (req.body.placeId !== undefined) updateData.placeId = req.body.placeId || null
  if (req.body.shortDescription !== undefined) updateData.shortDescription = req.body.shortDescription
  if (req.body.blocks !== undefined) updateData.blocks = req.body.blocks
  if (req.body.image !== undefined) updateData.image = req.body.image
  if (req.body.images !== undefined) updateData.images = req.body.images
  if (req.body.price !== undefined) updateData.price = req.body.price || null
  if (req.body.organizer !== undefined) updateData.organizer = req.body.organizer || null
  if (req.body.registrationUrl !== undefined) updateData.registrationUrl = req.body.registrationUrl || null
  if (req.body.isActive !== undefined) updateData.isActive = Boolean(req.body.isActive)

  const event = await prisma.event.update({
    where: { id: req.params.id },
    data: updateData,
  })

  res.json(event)
})

// @desc    Delete event
// @route   DELETE /api/admin/events/:id
// @access  Admin
export const deleteEvent = asyncHandler(async (req, res) => {
  const existing = await prisma.event.findUnique({ where: { id: req.params.id } })

  if (!existing) {
    res.status(404)
    throw new Error('Событие не найдено')
  }

  await prisma.event.delete({ where: { id: req.params.id } })

  res.json({ message: 'Событие удалено' })
})
