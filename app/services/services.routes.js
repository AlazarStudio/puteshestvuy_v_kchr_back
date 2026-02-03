import express from "express"
import {
  getServicesPublic,
  getServiceByIdOrSlugPublic,
} from "./services.public.controller.js"

const router = express.Router()

router.get("/", getServicesPublic)
router.get("/:idOrSlug", getServiceByIdOrSlugPublic)

export default router
