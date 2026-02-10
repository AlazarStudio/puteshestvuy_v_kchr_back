import express from "express"
import multer from "multer"

import { protect } from "../middleware/auth.middleware.js"

import {
  getUserProfile,
  updateUserProfile,
  getFavorites,
  addFavorite,
  removeFavorite,
  uploadUserAvatar
} from "./user.controller.js"

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

router
  .route("/profile")
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile)

router.post("/profile/avatar", protect, upload.single("file"), uploadUserAvatar)

router.get("/profile/favorites", protect, getFavorites)

router.post("/favorites/:entityType/:entityId", protect, addFavorite)
router.delete("/favorites/:entityType/:entityId", protect, removeFavorite)

export default router
