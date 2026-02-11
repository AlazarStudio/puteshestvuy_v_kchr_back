import express from 'express'
import { getPage } from './pages.public.controller.js'

const router = express.Router()

// Public routes (публичные маршруты)
router.get('/:pageName', getPage)

export default router
