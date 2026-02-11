import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'

const DEFAULT_CONTENT_BY_PAGE = {
  routes: {
    hero: {
      title: 'МАРШРУТЫ',
      description: 'Наши маршруты созданы для самостоятельного прохождения. Вы можете создать свой собственный маршрут в конструкторе во вкладке "Интересные места"',
      image: '/full_roates_bg.jpg',
    },
  },
  places: {
    hero: {
      title: 'ИНТЕРЕСНЫЕ МЕСТА',
      description: 'Создайте свой уникальный маршрут!',
      image: '/full_places_bg.jpg',
    },
  },
  news: {
    hero: {
      title: 'НОВОСТИ',
      description: 'Актуальные новости о туризме, событиях и интересных местах Карачаево-Черкесии',
      image: '/newBG.png',
    },
  },
  services: {
    hero: {
      title: 'УСЛУГИ И СЕРВИСЫ',
      description: 'Найдите надёжных гидов, прокат снаряжения и другие услуги для комфортного путешествия по Карачаево-Черкесии',
      image: '/full_roates_bg.jpg',
    },
  },
}

function deepMerge(target, source) {
  const out = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(out[key] || {}, source[key])
    } else if (source[key] !== undefined) {
      out[key] = source[key]
    }
  }
  return out
}

// @desc    Get page content (admin)
// @route   GET /api/admin/pages/:pageName
export const getPage = asyncHandler(async (req, res) => {
  const { pageName } = req.params
  
  if (!DEFAULT_CONTENT_BY_PAGE[pageName]) {
    return res.status(404).json({ message: 'Страница не найдена' })
  }

  const defaultContent = DEFAULT_CONTENT_BY_PAGE[pageName]
  
  let page = await prisma.page.findUnique({
    where: { id: pageName },
  })
  
  if (!page) {
    page = await prisma.page.create({
      data: {
        id: pageName,
        content: defaultContent,
      },
    })
  }
  
  const content = page.content && typeof page.content === 'object'
    ? deepMerge(JSON.parse(JSON.stringify(defaultContent)), page.content)
    : defaultContent
    
  res.json({ id: page.id, content })
})

// @desc    Update page content (admin)
// @route   PUT /api/admin/pages/:pageName
export const updatePage = asyncHandler(async (req, res) => {
  const { pageName } = req.params
  const { content } = req.body
  
  if (!DEFAULT_CONTENT_BY_PAGE[pageName]) {
    return res.status(404).json({ message: 'Страница не найдена' })
  }

  const defaultContent = DEFAULT_CONTENT_BY_PAGE[pageName]
  const contentToSave = content && typeof content === 'object' ? content : {}
  
  const page = await prisma.page.upsert({
    where: { id: pageName },
    create: {
      id: pageName,
      content: contentToSave,
    },
    update: {
      content: contentToSave,
    },
  })
  
  const merged = page.content && typeof page.content === 'object'
    ? deepMerge(JSON.parse(JSON.stringify(defaultContent)), page.content)
    : defaultContent
    
  res.json({ id: page.id, content: merged })
})
