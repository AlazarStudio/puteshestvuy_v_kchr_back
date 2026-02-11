import dotenv from 'dotenv'
dotenv.config()

import { prisma } from '../app/prisma.js'

async function syncViewCounts() {
  console.log('Starting sync of view counts...')

  try {
    // Синхронизируем счетчики для маршрутов
    const routes = await prisma.route.findMany({
      select: { id: true, title: true, uniqueViewsCount: true },
    })

    console.log(`Found ${routes.length} routes`)

    for (const route of routes) {
      const viewCount = await prisma.viewTracking.count({
        where: {
          entityType: 'route',
          entityId: route.id,
        },
      })

      const currentCount = route.uniqueViewsCount ?? 0
      if (viewCount !== currentCount) {
        console.log(`Updating route "${route.title}" (${route.id}): ${currentCount} -> ${viewCount}`)
        await prisma.route.update({
          where: { id: route.id },
          data: { uniqueViewsCount: viewCount },
        })
      }
    }

    // Синхронизируем счетчики для мест
    const places = await prisma.place.findMany({
      select: { id: true, title: true, uniqueViewsCount: true },
    })

    console.log(`Found ${places.length} places`)

    for (const place of places) {
      const viewCount = await prisma.viewTracking.count({
        where: {
          entityType: 'place',
          entityId: place.id,
        },
      })

      const currentCount = place.uniqueViewsCount ?? 0
      if (viewCount !== currentCount) {
        console.log(`Updating place "${place.title}" (${place.id}): ${currentCount} -> ${viewCount}`)
        await prisma.place.update({
          where: { id: place.id },
          data: { uniqueViewsCount: viewCount },
        })
      }
    }

    // Синхронизируем счетчики для сервисов
    const services = await prisma.service.findMany({
      select: { id: true, title: true, uniqueViewsCount: true },
    })

    console.log(`Found ${services.length} services`)

    for (const service of services) {
      const viewCount = await prisma.viewTracking.count({
        where: {
          entityType: 'service',
          entityId: service.id,
        },
      })

      const currentCount = service.uniqueViewsCount ?? 0
      if (viewCount !== currentCount) {
        console.log(`Updating service "${service.title}" (${service.id}): ${currentCount} -> ${viewCount}`)
        await prisma.service.update({
          where: { id: service.id },
          data: { uniqueViewsCount: viewCount },
        })
      }
    }

    console.log('Sync completed!')
  } catch (error) {
    console.error('Error during sync:', error)
    throw error
  }
}

syncViewCounts()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
