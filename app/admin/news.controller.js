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

// @desc    Get news with pagination
// @route   GET /api/admin/news
// @access  Admin
export const getNews = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit
  const search = req.query.search || ''

  const where = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}

  const [items, total] = await Promise.all([
    prisma.news.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.news.count({ where }),
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

// @desc    Get news by id
// @route   GET /api/admin/news/:id
// @access  Admin
export const getNewsById = asyncHandler(async (req, res) => {
  const news = await prisma.news.findUnique({
    where: { id: req.params.id },
  })

  if (!news) {
    res.status(404)
    throw new Error('Новость не найдена')
  }

  res.json(news)
})

// @desc    Create news
// @route   POST /api/admin/news
// @access  Admin
export const createNews = asyncHandler(async (req, res) => {
  const {
    title,
    category,
    shortDescription,
    content,
    author,
    publishedAt,
    isActive,
    images,
  } = req.body

  if (!title) {
    res.status(400)
    throw new Error('Заголовок обязателен')
  }

  const slug = generateSlug(title) + '-' + Date.now()

  const news = await prisma.news.create({
    data: {
      title,
      slug,
      category,
      shortDescription,
      content,
      author,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
      isActive: Boolean(isActive),
      images: images || [],
    },
  })

  res.status(201).json(news)
})

// @desc    Update news
// @route   PUT /api/admin/news/:id
// @access  Admin
export const updateNews = asyncHandler(async (req, res) => {
  const existing = await prisma.news.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Новость не найдена')
  }

  const {
    title,
    category,
    shortDescription,
    content,
    author,
    publishedAt,
    isActive,
    images,
  } = req.body

  const slug = title !== existing.title 
    ? generateSlug(title) + '-' + Date.now() 
    : existing.slug

  const news = await prisma.news.update({
    where: { id: req.params.id },
    data: {
      title,
      slug,
      category,
      shortDescription,
      content,
      author,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      images: images || undefined,
    },
  })

  res.json(news)
})

// @desc    Delete news
// @route   DELETE /api/admin/news/:id
// @access  Admin
export const deleteNews = asyncHandler(async (req, res) => {
  const existing = await prisma.news.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Новость не найдена')
  }

  await prisma.news.delete({
    where: { id: req.params.id },
  })

  res.json({ message: 'Новость удалена' })
})
