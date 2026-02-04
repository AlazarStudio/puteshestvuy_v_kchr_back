import express from "express"
import { getNewsPublic, getNewsByIdOrSlugPublic } from "./news.public.controller.js"

const router = express.Router()

router.get("/", getNewsPublic)
router.get("/:idOrSlug", getNewsByIdOrSlugPublic)

export default router
