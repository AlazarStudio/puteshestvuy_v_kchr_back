import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'

const DEFAULT_CONTENT = {
  hero: {
    title: 'КАРАЧАЕВО-ЧЕРКЕСИЯ',
    subtitle: 'Край величественных гор, древних традиций и гостеприимных народов',
    image: '/full_roates_bg.jpg',
    buttonText: 'Исследовать маршруты',
    buttonLink: '/routes',
  },
  intro: {
    title: 'Добро пожаловать в КЧР',
    content: '<p>Карачаево-Черкесская Республика — это уникальный регион на северных склонах Главного Кавказского хребта, где величественные горы встречаются с бескрайними альпийскими лугами, а древние традиции гармонично переплетаются с современностью.</p><p>Здесь расположены знаменитые курорты Домбай и Архыз, привлекающие туристов со всего мира. Уникальная природа региона включает заповедные леса, кристально чистые горные озёра и реки, питаемые ледниками.</p><p>Республика является домом для множества народов — карачаевцев, черкесов, абазин, ногайцев, русских и представителей других национальностей, создающих неповторимую культурную мозаику региона.</p>',
    image: '/slider1.png',
  },
  facts: [
    { number: '14 277', label: 'км²', description: 'Площадь региона' },
    { number: '466 000', label: 'чел.', description: 'Население' },
    { number: '80+', label: '', description: 'Народностей' },
    { number: '4 046', label: 'м', description: 'Высота Домбай-Ульген' },
  ],
  history: {
    intro: 'История Карачаево-Черкесии насчитывает тысячелетия. Эта земля помнит древние цивилизации, величие Аланского царства и становление современной республики.',
    timeline: [
      { year: 'V-IV тыс. до н.э.', title: 'Древние поселения', description: 'На территории современной КЧР появляются первые поселения. Археологические находки свидетельствуют о развитой культуре местных племён.' },
      { year: 'I-II век н.э.', title: 'Аланское царство', description: 'Формирование аланского государства. Аланы становятся одним из могущественных народов Северного Кавказа.' },
      { year: 'X-XIII век', title: 'Расцвет Алании', description: 'Период расцвета аланской культуры и государственности. Строительство храмов, развитие торговли по Великому Шёлковому пути.' },
      { year: '1828', title: 'Присоединение к России', description: 'Карачай добровольно входит в состав Российской империи, начинается новый этап развития региона.' },
      { year: '1922', title: 'Образование автономии', description: 'Создание Карачаево-Черкесской автономной области в составе РСФСР.' },
      { year: '1992', title: 'Современная республика', description: 'Карачаево-Черкесия получает статус республики в составе Российской Федерации.' },
    ],
  },
  nature: {
    title: 'Природа и география',
    cards: [
      { title: 'Горные вершины', description: 'Главный Кавказский хребет с вершинами свыше 4000 метров. Домбай-Ульген (4046 м) — высочайшая точка региона. Идеальные условия для альпинизма и горнолыжного спорта.', image: '/slider2.png' },
      { title: 'Горные озёра', description: 'Более 130 высокогорных озёр с кристально чистой водой. Озеро Туманлы-Кёль, Бадукские озёра, озеро Любви — жемчужины карачаево-черкесской природы.', image: '/slider3.png' },
      { title: 'Заповедные леса', description: 'Тебердинский государственный заповедник — один из старейших на Кавказе. Реликтовые леса, эндемичные виды растений и редкие животные.', image: '/slider4.png' },
      { title: 'Водопады и реки', description: 'Живописные водопады Софийские, Алибекский, Чучхурский. Горные реки Теберда, Кубань, Большой Зеленчук берут начало от ледников.', image: '/slider5.png' },
    ],
  },
  culture: {
    title: 'Народы и культура',
    intro: 'Карачаево-Черкесия — многонациональная республика, где веками живут в мире и согласии представители разных народов, каждый со своей уникальной культурой, языком и традициями.',
    items: [
      { name: 'Карачаевцы', description: 'Тюркоязычный народ, потомки алан. Славятся горским гостеприимством, традиционным овцеводством и уникальной кухней.', traditions: ['Нальчикский танец', 'Кузнечное ремесло', 'Ковроткачество'] },
      { name: 'Черкесы', description: 'Адыгский народ с богатой воинской историей. Хранители древних традиций Кавказа и знаменитого адыгского этикета.', traditions: ['Адыгэ хабзэ', 'Златокузнечество', 'Джигитовка'] },
      { name: 'Абазины', description: 'Древний народ Кавказа, родственный абхазам. Сохранили уникальный язык и богатый фольклор.', traditions: ['Эпос о нартах', 'Горное земледелие', 'Народная медицина'] },
      { name: 'Ногайцы', description: 'Тюркский народ со степной культурой. Известны мастерством коневодства и богатой устной традицией.', traditions: ['Эпос «Эдиге»', 'Коневодство', 'Войлочное производство'] },
    ],
  },
  places: {
    title: 'Достопримечательности',
    items: [
      { place: 'Домбай', title: 'Горнолыжный курорт Домбай', desc: 'Один из старейших горнолыжных курортов России с живописными трассами и развитой инфраструктурой', link: '/places/dombay', img: '/slider1.png', rating: '5.0', feedback: '124 отзыва' },
      { place: 'Архыз', title: 'Курорт Архыз', desc: 'Современный всесезонный курорт с горнолыжными трассами, канатными дорогами и экотропами', link: '/places/arkhyz', img: '/slider2.png', rating: '4.9', feedback: '89 отзывов' },
      { place: 'Теберда', title: 'Тебердинский заповедник', desc: 'Биосферный заповедник с уникальной флорой и фауной, музеем природы и экологическими тропами', link: '/places/teberda', img: '/slider3.png', rating: '5.0', feedback: '67 отзывов' },
      { place: 'Нижний Архыз', title: 'Древние аланские храмы', desc: 'Комплекс средневековых христианских храмов X века — памятники аланской архитектуры', link: '/places/alan-temples', img: '/slider4.png', rating: '4.8', feedback: '45 отзывов' },
    ],
    moreButtonText: 'Смотреть все места',
    moreButtonLink: '/places',
  },
  cta: {
    title: 'Готовы к путешествию?',
    text: 'Откройте для себя красоту Карачаево-Черкесии. Выберите маршрут и отправляйтесь в незабываемое приключение!',
    primaryButtonText: 'Выбрать маршрут',
    primaryButtonLink: '/routes',
    secondaryButtonText: 'Найти гида',
    secondaryButtonLink: '/services',
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

// @desc    Get region content (admin)
// @route   GET /api/admin/region
export const getRegion = asyncHandler(async (req, res) => {
  let region = await prisma.region.findUnique({
    where: { id: 'default' },
  })
  if (!region) {
    region = await prisma.region.create({
      data: {
        id: 'default',
        content: DEFAULT_CONTENT,
      },
    })
  }
  const content = region.content && typeof region.content === 'object'
    ? deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONTENT)), region.content)
    : DEFAULT_CONTENT
  res.json({ id: region.id, content })
})

// @desc    Update region content (admin)
// @route   PUT /api/admin/region
export const updateRegion = asyncHandler(async (req, res) => {
  const { content } = req.body
  const contentToSave = content && typeof content === 'object' ? content : {}
  const region = await prisma.region.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      content: contentToSave,
    },
    update: {
      content: contentToSave,
    },
  })
  const merged = region.content && typeof region.content === 'object'
    ? deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONTENT)), region.content)
    : DEFAULT_CONTENT
  res.json({ id: region.id, content: merged })
})
