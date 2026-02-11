import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"
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
  uploadDocument,
  uploadVideo,
  getMedia,
  deleteMedia,
} from "./media.controller.js"

import { getDashboardStats } from "./stats.controller.js"

import {
  getPlaceFilters,
  updatePlaceFilters,
  addPlaceFilterGroup,
  removePlaceFilterGroup,
  updatePlaceFilterGroupMeta,
  replaceFilterValue,
  removeFilterValue,
} from "./place-filters.controller.js"

import {
  getRouteFilters,
  updateRouteFilters,
  addRouteFilterGroup,
  removeRouteFilterGroup,
  updateRouteFilterGroupMeta,
  replaceRouteFilterValue,
  removeRouteFilterValue,
} from "./route-filters.controller.js"

import { getRegion, updateRegion } from "./region.controller.js"
import { getFooter, updateFooter } from "./footer.controller.js"
import { getHome, updateHome } from "./home.controller.js"
import { getPage, updatePage } from "./pages.controller.js"

const router = express.Router()

// Все форматы изображений для конвертации в WebP (SVG сохраняется как есть)
const imageMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
  'image/x-icon',
  'image/avif',
]

const imageFileFilter = (req, file, cb) => {
  if (imageMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Недопустимый тип файла. Разрешены только изображения.'), false)
  }
}

// Для загрузки изображений: буфер в память → в контроллере конвертация в WebP
const uploadImage = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB до конвертации
})

const docMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const docFileFilter = (req, file, cb) => {
  if (docMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Разрешены только PDF, DOC, DOCX'), false)
  }
}
const uploadDoc = multer({
  storage: multer.memoryStorage(),
  fileFilter: docFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
})

const videoMimeTypes = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
]
const videoFileFilter = (req, file, cb) => {
  if (videoMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Разрешены только видеофайлы: MP4, WebM, MOV, AVI, MKV'), false)
  }
}
const uploadVideoFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: videoFileFilter,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
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

// Media (изображения → конвертация в WebP)
router.post("/media/upload", uploadImage.single('file'), uploadFile)
router.post("/media/upload-document", uploadDoc.single('file'), uploadDocument)
router.post("/media/upload-video", uploadVideoFile.single('file'), uploadVideo)
router.get("/media", getMedia)
router.delete("/media/:id", deleteMedia)

// Place filters (конфигурация фильтров мест)
router.get("/place-filters", getPlaceFilters)
router.put("/place-filters", updatePlaceFilters)
router.post("/place-filters/add-group", addPlaceFilterGroup)
router.post("/place-filters/remove-group", removePlaceFilterGroup)
router.patch("/place-filters/group-meta", updatePlaceFilterGroupMeta)
router.post("/place-filters/replace-value", replaceFilterValue)
router.post("/place-filters/remove-value", removeFilterValue)

// Region (страница «О регионе»)
router.get("/region", getRegion)
router.put("/region", updateRegion)

// Home (главная страница)
router.get("/home", getHome)
router.put("/home", updateHome)

// Footer
router.get("/footer", getFooter)
router.put("/footer", updateFooter)

// Pages (страницы сайта: routes, places, news, services)
router.get("/pages/:pageName", getPage)
router.put("/pages/:pageName", updatePage)

// Route filters (конфигурация фильтров маршрутов)
router.get("/route-filters", getRouteFilters)
router.put("/route-filters", updateRouteFilters)
router.post("/route-filters/add-group", addRouteFilterGroup)
router.post("/route-filters/remove-group", removeRouteFilterGroup)
router.patch("/route-filters/group-meta", updateRouteFilterGroupMeta)
router.post("/route-filters/replace-value", replaceRouteFilterValue)
router.post("/route-filters/remove-value", removeRouteFilterValue)

export default router
