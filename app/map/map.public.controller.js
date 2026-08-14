import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

// Координаты считаются заполненными, только если они не пустые и не нулевые:
// нулевая пара — это Гвинейский залив, а не Карачаево-Черкесия
const hasCoords = {
  latitude: { not: null },
  longitude: { not: null },
  NOT: [{ latitude: 0 }, { longitude: 0 }],
}

// @desc    Точки для интерактивной карты: оба слоя одним ответом, без пагинации
// @route   GET /api/map-objects
export const getMapObjects = asyncHandler(async (req, res) => {
  const [places, services] = await Promise.all([
    prisma.place.findMany({
      where: { isActive: true, ...hasCoords },
      select: {
        id: true,
        slug: true,
        title: true,
        latitude: true,
        longitude: true,
        image: true,
        images: true,
        location: true,
        objectTypes: true,
        mapIcon: true,
        mapIconType: true,
      },
    }),
    prisma.service.findMany({
      // Гиды исключаются на сервере, а не на клиенте: часть их координат —
      // жилые адреса физических лиц, и они не должны попадать в публичный ответ
      where: { isActive: true, category: { not: 'Гид' }, ...hasCoords },
      select: {
        id: true,
        slug: true,
        title: true,
        latitude: true,
        longitude: true,
        images: true,
        address: true,
        category: true,
        mapIcon: true,
        mapIconType: true,
      },
    }),
  ])

  // Точки обоих слоёв приводятся к одной форме, чтобы карта не разбирала два вида.
  // Обложка везде значит «превью, а если его нет — первое фото галереи», как в
  // остальных публичных списках: у большинства мест отдельного превью нет.
  // У услуги роль локации играет адрес — своего поля location в схеме нет
  res.json({
    places: places.map(({ images, ...place }) => ({
      ...place,
      image: place.image || images?.[0] || null,
    })),
    services: services.map(({ images, address, ...service }) => ({
      ...service,
      image: images?.[0] || null,
      location: address || null,
    })),
  })
})
