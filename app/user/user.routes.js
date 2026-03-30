import express from "express"
import multer from "multer"

import { protect } from "../middleware/auth.middleware.js"
import { imageDiskStorage } from "../utils/imageUpload.js"

import {
  getUserProfile,
  updateUserProfile,
  getFavorites,
  getConstructorPoints,
  updateConstructorPoints,
  addFavorite,
  removeFavorite,
  uploadUserAvatar,
  getUserRoutes,
  getUserRouteById,
  createUserRoute,
  updateUserRoute,
  deleteUserRoute
} from "./user.controller.js"

const router = express.Router()

const avatarFileFilter = (req, file, cb) => {
  if (typeof file.mimetype === "string" && file.mimetype.startsWith("image/")) {
    cb(null, true)
  } else {
    cb(new Error("Недопустимый тип файла. Разрешены только изображения."), false)
  }
}

const upload = multer({
  storage: imageDiskStorage,
  fileFilter: avatarFileFilter,
  limits: { fileSize: 15 * 1024 * 1024 },
})

router
  .route("/profile")
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile)

router.post("/profile/avatar", protect, upload.single("file"), uploadUserAvatar)

router.get("/profile/favorites", protect, getFavorites)

router.get("/constructor-points", protect, getConstructorPoints)
router.put("/constructor-points", protect, updateConstructorPoints)

router.post("/favorites/:entityType/:entityId", protect, addFavorite)
router.delete("/favorites/:entityType/:entityId", protect, removeFavorite)

// Пользовательские маршруты
router
  .route("/routes")
  .get(protect, getUserRoutes)
  .post(protect, createUserRoute)

router
  .route("/routes/:id")
  .get(protect, getUserRouteById)
  .put(protect, updateUserRoute)
  .delete(protect, deleteUserRoute)

export default router
