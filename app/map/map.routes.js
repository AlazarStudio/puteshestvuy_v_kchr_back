import express from "express"
import { getMapObjects } from "./map.public.controller.js"

const router = express.Router()

router.get("/", getMapObjects)

export default router
