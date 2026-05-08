import express from 'express'
import { protect } from '../middleware/auth.middleware.js'
import { createSuggestion, getMySuggestions } from './suggestions.controller.js'

const router = express.Router()

router.use(protect)

router.post('/places', createSuggestion)
router.get('/places/my', getMySuggestions)

export default router
