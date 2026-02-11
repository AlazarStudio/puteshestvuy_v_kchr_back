import express from "express"
import { getHomePublic } from "./home.public.controller.js"

const router = express.Router()

router.get("/", getHomePublic)

export default router
