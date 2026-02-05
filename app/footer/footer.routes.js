import express from "express"
import { getFooterPublic } from "./footer.public.controller.js"
import { sendFeedback } from "./feedback.controller.js"

const router = express.Router()

router.get("/", getFooterPublic)
router.post("/feedback", sendFeedback)

export default router
