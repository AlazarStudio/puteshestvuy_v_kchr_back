import { PrismaClient } from "../generated/client/index.js"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const prisma = new PrismaClient()

async function importPlaces() {
  console.log("Загрузка данных из places_from_attractions.json...")
  
  // Загружаем данные
  const filePath = join(__dirname, "..", "places_from_attractions.json")
  const fileContent = readFileSync(filePath, "utf-8")
  const places = JSON.parse(fileContent)
  
  console.log(`Загружено ${places.length} мест для импорта\n`)
  
  let successCount = 0
  let errorCount = 0
  let reviewsCreated = 0
  
  for (let i = 0; i < places.length; i++) {
    const placeData = places[i]
    
    try {
      // Подготавливаем данные для создания Place
      const placeCreateData = {
        title: placeData.title,
        slug: placeData.slug,
        location: placeData.location || null,
        latitude: placeData.latitude != null ? placeData.latitude : null,
        longitude: placeData.longitude != null ? placeData.longitude : null,
        shortDescription: placeData.shortDescription || null,
        description: placeData.description || null,
        howToGet: placeData.howToGet || null,
        mapUrl: placeData.mapUrl || null,
        audioGuide: placeData.audioGuide || null,
        video: placeData.video || null,
        rating: placeData.rating != null ? placeData.rating : null,
        reviewsCount: placeData.reviewsCount || 0,
        isActive: placeData.isActive === true || placeData.isActive === undefined, // По умолчанию true
        image: placeData.image || null,
        sliderVideo: placeData.sliderVideo || null,
        images: Array.isArray(placeData.images) ? placeData.images : [],
        directions: Array.isArray(placeData.directions) ? placeData.directions : [],
        seasons: Array.isArray(placeData.seasons) ? placeData.seasons : [],
        objectTypes: Array.isArray(placeData.objectTypes) ? placeData.objectTypes : [],
        accessibility: Array.isArray(placeData.accessibility) ? placeData.accessibility : [],
        customFilters: placeData.customFilters || null,
        nearbyPlaceIds: Array.isArray(placeData.nearbyPlaceIds) ? placeData.nearbyPlaceIds : [],
      }
      
      // Парсим даты если они есть (Prisma автоматически установит createdAt и updatedAt если не указаны)
      // Но мы можем передать оригинальные даты для сохранения истории
      if (placeData.createdAt) {
        try {
          const parsedDate = new Date(placeData.createdAt.replace(/\s/g, ""))
          if (!isNaN(parsedDate.getTime())) {
            // Не передаем в data, Prisma сам установит createdAt при создании
            // Но можем использовать для reviews
          }
        } catch (e) {
          // Игнорируем ошибки парсинга дат
        }
      }
      
      // Проверяем, существует ли уже место с таким slug
      const existingPlace = await prisma.place.findUnique({
        where: { slug: placeData.slug },
      })
      
      let place
      if (existingPlace) {
        console.log(`[${i + 1}/${places.length}] Место "${placeData.title}" уже существует, пропускаем...`)
        place = existingPlace
      } else {
        // Создаем место
        place = await prisma.place.create({
          data: placeCreateData,
        })
        
        successCount++
        if ((i + 1) % 10 === 0) {
          console.log(`[${i + 1}/${places.length}] Создано мест: ${successCount}, Ошибок: ${errorCount}`)
        }
      }
      
      // Создаем отзывы если они есть
      if (placeData.reviews && Array.isArray(placeData.reviews) && placeData.reviews.length > 0) {
        for (const reviewData of placeData.reviews) {
          try {
            // Парсим дату создания отзыва
            let reviewCreatedAt = new Date()
            if (reviewData.createdAt) {
              try {
                reviewCreatedAt = new Date(reviewData.createdAt.replace(/\s/g, ""))
              } catch (e) {
                reviewCreatedAt = new Date()
              }
            }
            
            await prisma.review.create({
              data: {
                authorName: reviewData.authorName || "Анонимный пользователь",
                authorAvatar: reviewData.authorAvatar || null,
                rating: reviewData.rating || 5,
                text: reviewData.text || "",
                status: reviewData.status === "approved" ? "approved" : "pending",
                entityType: "place",
                entityId: place.id,
                entityTitle: place.title,
                createdAt: reviewCreatedAt,
              },
            })
            
            reviewsCreated++
          } catch (reviewError) {
            console.error(`  Ошибка создания отзыва для места "${placeData.title}":`, reviewError.message)
          }
        }
      }
      
    } catch (error) {
      errorCount++
      console.error(`[${i + 1}/${places.length}] Ошибка создания места "${placeData.title}":`, error.message)
      
      // Если ошибка связана с дубликатом slug, пробуем создать с новым slug
      if (error.code === "P2002" && error.meta?.target?.includes("slug")) {
        try {
          const newSlug = `${placeData.slug}-${Date.now()}`
          const placeCreateData = {
            ...placeData,
            slug: newSlug,
          }
          
          const place = await prisma.place.create({
            data: {
              title: placeCreateData.title,
              slug: newSlug,
              location: placeCreateData.location || null,
              latitude: placeCreateData.latitude != null ? placeCreateData.latitude : null,
              longitude: placeCreateData.longitude != null ? placeCreateData.longitude : null,
              shortDescription: placeCreateData.shortDescription || null,
              description: placeCreateData.description || null,
              howToGet: placeCreateData.howToGet || null,
              mapUrl: placeCreateData.mapUrl || null,
              audioGuide: placeCreateData.audioGuide || null,
              video: placeCreateData.video || null,
              rating: placeCreateData.rating != null ? placeCreateData.rating : null,
              reviewsCount: placeCreateData.reviewsCount || 0,
              isActive: placeCreateData.isActive !== false,
              image: placeCreateData.image || null,
              sliderVideo: placeCreateData.sliderVideo || null,
              images: Array.isArray(placeCreateData.images) ? placeCreateData.images : [],
              directions: Array.isArray(placeCreateData.directions) ? placeCreateData.directions : [],
              seasons: Array.isArray(placeCreateData.seasons) ? placeCreateData.seasons : [],
              objectTypes: Array.isArray(placeCreateData.objectTypes) ? placeCreateData.objectTypes : [],
              accessibility: Array.isArray(placeCreateData.accessibility) ? placeCreateData.accessibility : [],
              customFilters: placeCreateData.customFilters || null,
              nearbyPlaceIds: Array.isArray(placeCreateData.nearbyPlaceIds) ? placeCreateData.nearbyPlaceIds : [],
            },
          })
          
          successCount++
          errorCount--
          console.log(`  Создано с новым slug: ${newSlug}`)
        } catch (retryError) {
          console.error(`  Не удалось создать даже с новым slug:`, retryError.message)
        }
      }
    }
  }
  
  console.log("\n" + "=".repeat(50))
  console.log("Импорт завершен!")
  console.log("=".repeat(50))
  console.log(`Успешно создано мест: ${successCount}`)
  console.log(`Создано отзывов: ${reviewsCreated}`)
  console.log(`Ошибок: ${errorCount}`)
  console.log("=".repeat(50))
}

// Запускаем импорт
importPlaces()
  .catch((error) => {
    console.error("Критическая ошибка:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
