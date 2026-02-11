import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'

const DEFAULT_CONTENT = {
  routesTitle: 'Маршруты',
  routesButtonLink: '/routes',
  seasons: [
    {
      title: 'Зима',
      bgColor: '#73BFE7',
      patternColor: '#296587',
      logo: 'logoPattern1.png',
      routeLink: '/routes?seasons=Зима',
    },
    {
      title: 'Весна',
      bgColor: '#FF9397',
      patternColor: '#DB224A',
      logo: 'logoPattern2.png',
      routeLink: '/routes?seasons=Весна',
    },
    {
      title: 'Лето',
      bgColor: '#66D7CA',
      patternColor: '#156A60',
      logo: 'logoPattern3.png',
      routeLink: '/routes?seasons=Лето',
    },
    {
      title: 'Осень',
      bgColor: '#CD8A67',
      patternColor: '#7C4B42',
      logo: 'logoPattern4.png',
      routeLink: '/routes?seasons=Осень',
    },
  ],
  firstTimeTitle: 'ВПЕРВЫЕ В КЧР?',
  firstTimeDesc: 'Специально для вас мы создали раздел, в котором собрали всю полезную информацию, чтобы помочь сделать ваше путешествие по нашей удивительной республике комфортным, интересным и незабываемым!',
  firstTimeArticles: [], // Массив выбранных статей для секции "ВПЕРВЫЕ В КЧР?"
  servicesTitle: 'СЕРВИС И УСЛУГИ',
  servicesButtonLink: '/services',
  servicesCardsLimit: 8, // Максимальное количество карточек услуг в каждом табе
  placesTitle: 'КУДА ПОЕХАТЬ?',
  placesButtonLink: '/places',
  placesItems: [], // Массив выбранных мест для блока "Куда поехать?"
  backgroundImage: '/mountainBG.png',
  sliderPlaces: [], // Массив выбранных мест для главного слайдера
  banners: [], // Массив баннеров: [{ id, image, link, isActive, isPermanent }]
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

// @desc    Get home content (public)
// @route   GET /api/home
export const getHomePublic = asyncHandler(async (req, res) => {
  const home = await prisma.home.findUnique({
    where: { id: 'default' },
  })
  const content = home?.content && typeof home.content === 'object'
    ? deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONTENT)), home.content)
    : DEFAULT_CONTENT
  res.json(content)
})
