import express from "express"
import { getEventsPublic, getEventByIdOrSlugPublic } from "./events.public.controller.js"

const router = express.Router()

router.get("/", getEventsPublic)
router.get("/:idOrSlug", getEventByIdOrSlugPublic)

export default router
