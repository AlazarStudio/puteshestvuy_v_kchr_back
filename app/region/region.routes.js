import express from "express"
import { getRegionPublic } from "./region.public.controller.js"

const router = express.Router()

router.get("/", getRegionPublic)

export default router
