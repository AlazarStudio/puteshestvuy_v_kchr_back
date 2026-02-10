import { faker } from "@faker-js/faker"
import { hash, verify } from "argon2"
import asyncHandler from "express-async-handler"

import { prisma } from "../prisma.js"
import { UserFields } from "../utils/user.utils.js"

import { generateToken } from "./generate-token.js"

// @desc    Auth user
// @route   POST /api/auth/login
// @access  Public
export const authUser = asyncHandler(async (req, res) => {
  const { login, password } = req.body

  if (!login || !password) {
    res.status(400)
    throw new Error("Please provide login and password")
  }

  const user = await prisma.user.findUnique({
    where: {
      login
    }
  })

  if (!user) {
    res.status(401)
    throw new Error("Invalid login or password")
  }

  const isValidPassword = await verify(user.password, password)

  if (isValidPassword) {
    const token = generateToken(user.id)
    const userWithFields = await prisma.user.findUnique({
      where: { id: user.id },
      select: UserFields
    })
    res.json({
      user: userWithFields,
      token
    })
  } else {
    res.status(401)
    throw new Error("Invalid login or password")
  }
})

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const registerUser = asyncHandler(async (req, res) => {
  const { login, email, password, name } = req.body

  if (!login || !email || !password) {
    res.status(400)
    throw new Error("Please provide login, email and password")
  }

  if (password.length < 6) {
    res.status(400)
    throw new Error("Password must be at least 6 characters")
  }

  const isHaveUser = await prisma.user.findUnique({
    where: {
      login
    }
  })

  if (isHaveUser) {
    res.status(400)
    throw new Error("User with this login already exists")
  }

  const isHaveEmail = await prisma.user.findUnique({
    where: {
      email
    }
  })

  if (isHaveEmail) {
    res.status(400)
    throw new Error("User with this email already exists")
  }

  const user = await prisma.user.create({
    data: {
      login,
      email,
      password: await hash(password),
      name: name || faker.person.fullName()
    },
    select: UserFields
  })

  const token = generateToken(user.id)
  console.log("[auth] New user registered:", user.id, user.login, user.email)

  res.status(201).json({ user, token })
})
