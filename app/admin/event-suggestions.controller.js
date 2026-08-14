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

// Текст заявки переезжает в тело события одним текстовым блоком:
// заявитель пишет обычный текст, блоки собирает редактор
const descriptionToBlocks = (description) => {
  if (!description || !description.trim()) return []
  return [
    {
      id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'text',
      order: 0,
      data: { content: description },
    },
  ]
}

// @desc    Get all event suggestions with pagination
// @route   GET /api/admin/event-suggestions
export const getEventSuggestions = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = parseInt(req.query.limit) || 20
  const skip = (page - 1) * limit
  const status = req.query.status || undefined

  const where = status ? { status } : {}

  const [items, total] = await Promise.all([
    prisma.eventSuggestion.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.eventSuggestion.count({ where }),
  ])

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
})

// @desc    Get pending event suggestions count
// @route   GET /api/admin/event-suggestions/pending-count
export const getEventSuggestionsPendingCount = asyncHandler(async (req, res) => {
  const count = await prisma.eventSuggestion.count({ where: { status: { in: ['pending', 'in_review'] } } })
  res.json({ count })
})

// @desc    Get event suggestion by id
// @route   GET /api/admin/event-suggestions/:id
export const getEventSuggestionById = asyncHandler(async (req, res) => {
  const suggestion = await prisma.eventSuggestion.findUnique({
    where: { id: req.params.id },
  })
  if (!suggestion) {
    res.status(404)
    throw new Error('Заявка не найдена')
  }
  res.json(suggestion)
})

// @desc    Update event suggestion (fields or status/comment)
// @route   PUT /api/admin/event-suggestions/:id
export const updateEventSuggestion = asyncHandler(async (req, res) => {
  const existing = await prisma.eventSuggestion.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404)
    throw new Error('Заявка не найдена')
  }

  const allowed = [
    'status', 'adminComment',
    'title', 'startAt', 'endAt', 'location',
    'shortDescription', 'description',
    'organizer', 'price', 'registrationUrl', 'image',
  ]

  const data = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      data[key] = key === 'startAt' || key === 'endAt'
        ? (req.body[key] ? new Date(req.body[key]) : null)
        : req.body[key]
    }
  }

  const updated = await prisma.eventSuggestion.update({
    where: { id: req.params.id },
    data,
  })
  res.json(updated)
})

// @desc    Approve suggestion — creates a draft Event and returns its id
// @route   POST /api/admin/event-suggestions/:id/approve
export const approveEventSuggestion = asyncHandler(async (req, res) => {
  const suggestion = await prisma.eventSuggestion.findUnique({
    where: { id: req.params.id },
  })
  if (!suggestion) {
    res.status(404)
    throw new Error('Заявка не найдена')
  }

  const slug = generateSlug(suggestion.title) + '-' + Date.now()

  const event = await prisma.event.create({
    data: {
      title: suggestion.title,
      slug,
      startAt: suggestion.startAt,
      endAt: suggestion.endAt,
      location: suggestion.location,
      shortDescription: suggestion.shortDescription,
      blocks: descriptionToBlocks(suggestion.description),
      image: suggestion.image,
      images: [],
      organizer: suggestion.organizer,
      price: suggestion.price,
      registrationUrl: suggestion.registrationUrl,
      isActive: false,
    },
  })

  await prisma.eventSuggestion.update({
    where: { id: req.params.id },
    data: { status: 'in_review', approvedEventId: event.id },
  })

  res.json({ eventId: event.id })
})

// @desc    Confirm approve — sets status to approved
// @route   POST /api/admin/event-suggestions/:id/confirm-approve
export const confirmApproveEventSuggestion = asyncHandler(async (req, res) => {
  const suggestion = await prisma.eventSuggestion.findUnique({
    where: { id: req.params.id },
  })
  if (!suggestion) {
    res.status(404)
    throw new Error('Заявка не найдена')
  }
  const updated = await prisma.eventSuggestion.update({
    where: { id: req.params.id },
    data: { status: 'approved' },
  })
  res.json(updated)
})

// @desc    Delete event suggestion
// @route   DELETE /api/admin/event-suggestions/:id
export const deleteEventSuggestion = asyncHandler(async (req, res) => {
  const existing = await prisma.eventSuggestion.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404)
    throw new Error('Заявка не найдена')
  }
  await prisma.eventSuggestion.delete({ where: { id: req.params.id } })
  res.json({ message: 'Заявка удалена' })
})
