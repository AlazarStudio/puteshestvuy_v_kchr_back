import express from 'express'
import { protect } from '../middleware/auth.middleware.js'
import {
  getPublicPhotos,
  createPhotos,
  getMyPhotos,
  deleteMyPhoto,
} from './gallery.controller.js'

const router = express.Router()

// GET / публичный, остальное — под protect
router.get('/', getPublicPhotos)
router.post('/photos', protect, createPhotos)
router.get('/photos/my', protect, getMyPhotos)
router.delete('/photos/:id', protect, deleteMyPhoto)

export default router
