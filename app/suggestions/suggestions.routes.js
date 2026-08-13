import express from 'express'
import { protect } from '../middleware/auth.middleware.js'
import {
  createSuggestion,
  getMySuggestions,
  createEventSuggestion,
  getMyEventSuggestions,
} from './suggestions.controller.js'

const router = express.Router()

router.use(protect)

router.post('/places', createSuggestion)
router.get('/places/my', getMySuggestions)

router.post('/events', createEventSuggestion)
router.get('/events/my', getMyEventSuggestions)

export default router
