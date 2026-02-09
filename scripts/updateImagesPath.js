import { PrismaClient } from "../generated/client/index.js"

const prisma = new PrismaClient()

async function updateImagesPath() {
  console.log("Обновление путей к картинкам...")
  
  // Получаем все места
  const places = await prisma.place.findMany({
    select: {
      id: true,
      title: true,
      image: true,
      images: true,
    },
  })
  
  console.log(`Найдено ${places.length} мест для проверки\n`)
  
  let updatedCount = 0
  let skippedCount = 0
  
  for (let i = 0; i < places.length; i++) {
    const place = places[i]
    let needsUpdate = false
    const updateData = {}
    
    // Обновляем главное изображение (image)
    if (place.image) {
      if (!place.image.startsWith("/uploads/") && !place.image.startsWith("http")) {
        updateData.image = `/uploads/${place.image}`
        needsUpdate = true
      }
    }
    
    // Обновляем массив изображений (images)
    if (place.images && Array.isArray(place.images) && place.images.length > 0) {
      const updatedImages = place.images.map((img) => {
        if (!img) return img
        if (img.startsWith("/uploads/") || img.startsWith("http")) {
          return img
        }
        return `/uploads/${img}`
      })
      
      // Проверяем, изменился ли массив
      const hasChanges = updatedImages.some((img, idx) => img !== place.images[idx])
      
      if (hasChanges) {
        updateData.images = updatedImages
        needsUpdate = true
      }
    }
    
    if (needsUpdate) {
      try {
        await prisma.place.update({
          where: { id: place.id },
          data: updateData,
        })
        
        updatedCount++
        
        if ((i + 1) % 50 === 0) {
          console.log(`[${i + 1}/${places.length}] Обновлено: ${updatedCount}, Пропущено: ${skippedCount}`)
        }
      } catch (error) {
        console.error(`Ошибка обновления места "${place.title}" (ID: ${place.id}):`, error.message)
      }
    } else {
      skippedCount++
    }
  }
  
  console.log("\n" + "=".repeat(50))
  console.log("Обновление завершено!")
  console.log("=".repeat(50))
  console.log(`Всего мест: ${places.length}`)
  console.log(`Обновлено: ${updatedCount}`)
  console.log(`Пропущено (уже имеют правильный путь): ${skippedCount}`)
  console.log("=".repeat(50))
}

// Запускаем обновление
updateImagesPath()
  .catch((error) => {
    console.error("Критическая ошибка:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
