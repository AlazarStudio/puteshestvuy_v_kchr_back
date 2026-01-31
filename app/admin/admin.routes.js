import express from "express"
import multer from "multer"
import path from "path"
import { protect, admin } from "../middleware/auth.middleware.js"

// Controllers
import {
  getRoutes,
  getRouteById,
  createRoute,
  updateRoute,
  deleteRoute,
} from "./routes.controller.js"

import {
  getPlaces,
  getPlaceById,
  createPlace,
  updatePlace,
  deletePlace,
} from "./places.controller.js"

import {
  getNews,
  getNewsById,
  createNews,
  updateNews,
  deleteNews,
} from "./news.controller.js"

import {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
} from "./services.controller.js"

import {
  getReviews,
  getReviewById,
  updateReview,
  deleteReview,
} from "./reviews.controller.js"

import {
  uploadFile,
  getMedia,
  deleteMedia,
} from "./media.controller.js"

import { getDashboardStats } from "./stats.controller.js"

import {
  getPlaceFilters,
  updatePlaceFilters,
  replaceFilterValue,
  removeFilterValue,
} from "./place-filters.controller.js"

const router = express.Router()

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/')
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  },
})

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/mpeg', 'audio/mp3', 'video/mp4']
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Недопустимый тип файла'), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

// Все роуты защищены middleware protect и admin
router.use(protect, admin)

// Stats
router.get("/stats", getDashboardStats)

// Routes (маршруты)
router.route("/routes")
  .get(getRoutes)
  .post(createRoute)

router.route("/routes/:id")
  .get(getRouteById)
  .put(updateRoute)
  .delete(deleteRoute)

// Places (места)
router.route("/places")
  .get(getPlaces)
  .post(createPlace)

router.route("/places/:id")
  .get(getPlaceById)
  .put(updatePlace)
  .delete(deletePlace)

// News (новости)
router.route("/news")
  .get(getNews)
  .post(createNews)

router.route("/news/:id")
  .get(getNewsById)
  .put(updateNews)
  .delete(deleteNews)

// Services (услуги)
router.route("/services")
  .get(getServices)
  .post(createService)

router.route("/services/:id")
  .get(getServiceById)
  .put(updateService)
  .delete(deleteService)

// Reviews (отзывы)
router.route("/reviews")
  .get(getReviews)

router.route("/reviews/:id")
  .get(getReviewById)
  .put(updateReview)
  .delete(deleteReview)

// Media (файлы)
router.post("/media/upload", upload.single('file'), uploadFile)
router.get("/media", getMedia)
router.delete("/media/:id", deleteMedia)

// Place filters (конфигурация фильтров мест)
router.get("/place-filters", getPlaceFilters)
router.put("/place-filters", updatePlaceFilters)
router.post("/place-filters/replace-value", replaceFilterValue)
router.post("/place-filters/remove-value", removeFilterValue)

export default router
