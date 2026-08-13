import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'

// @desc    Submit a place suggestion
// @route   POST /api/suggestions/places
// @access  Auth (user)
export const createSuggestion = asyncHandler(async (req, res) => {
  const {
    title, location, latitude, longitude,
    shortDescription, description, howToGet, importantInfo,
    mapUrl, audioGuide, video, image, sliderVideo,
    images, directions, seasons, objectTypes, accessibility,
  } = req.body

  if (!title) {
    res.status(400)
    throw new Error('Название обязательно')
  }

  const suggestion = await prisma.placeSuggestion.create({
    data: {
      submittedById: req.user.id,
      submitterName: req.user.name || null,
      submitterEmail: req.user.email || null,
      title,
      location: location || null,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      shortDescription: shortDescription || null,
      description: description || null,
      howToGet: howToGet || null,
      importantInfo: importantInfo || null,
      mapUrl: mapUrl || null,
      audioGuide: audioGuide || null,
      video: video || null,
      image: image || null,
      sliderVideo: sliderVideo || null,
      images: Array.isArray(images) ? images : [],
      directions: Array.isArray(directions) ? directions : [],
      seasons: Array.isArray(seasons) ? seasons : [],
      objectTypes: Array.isArray(objectTypes) ? objectTypes : [],
      accessibility: Array.isArray(accessibility) ? accessibility : [],
    },
  })

  res.status(201).json(suggestion)
})

// @desc    Get current user's suggestions
// @route   GET /api/suggestions/places/my
// @access  Auth (user)
export const getMySuggestions = asyncHandler(async (req, res) => {
  const suggestions = await prisma.placeSuggestion.findMany({
    where: { submittedById: req.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      title: true,
      location: true,
      status: true,
      adminComment: true,
      approvedPlaceId: true,
    },
  })
  res.json(suggestions)
})

// @desc    Submit an event suggestion
// @route   POST /api/suggestions/events
// @access  Auth (user)
export const createEventSuggestion = asyncHandler(async (req, res) => {
  const {
    title, startAt, endAt, location,
    shortDescription, description,
    organizer, price, registrationUrl, image,
  } = req.body

  if (!title) {
    res.status(400)
    throw new Error('Название обязательно')
  }

  // Сервер требует меньше, чем форма: без названия и даты начала запись
  // бессмысленна, остальное — забота о качестве заявки, и проверяется на клиенте
  const start = startAt ? new Date(startAt) : null
  if (!start || Number.isNaN(start.getTime())) {
    res.status(400)
    throw new Error('Дата начала обязательна')
  }

  const end = endAt ? new Date(endAt) : null

  const suggestion = await prisma.eventSuggestion.create({
    data: {
      submittedById: req.user.id,
      submitterName: req.user.name || null,
      submitterEmail: req.user.email || null,
      title,
      startAt: start,
      endAt: end && !Number.isNaN(end.getTime()) ? end : null,
      location: location || null,
      shortDescription: shortDescription || null,
      description: description || null,
      organizer: organizer || null,
      price: price || null,
      registrationUrl: registrationUrl || null,
      image: image || null,
    },
  })

  res.status(201).json(suggestion)
})

// @desc    Get current user's event suggestions
// @route   GET /api/suggestions/events/my
// @access  Auth (user)
export const getMyEventSuggestions = asyncHandler(async (req, res) => {
  const suggestions = await prisma.eventSuggestion.findMany({
    where: { submittedById: req.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      title: true,
      startAt: true,
      location: true,
      status: true,
      adminComment: true,
    },
  })
  res.json(suggestions)
})
