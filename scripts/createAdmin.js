import { hash } from "argon2"
import { PrismaClient } from "../generated/client/index.js"

const prisma = new PrismaClient()

async function createAdmin() {
  const login = "admin"
  const email = "admin@kchr.ru"
  const password = "GXUqJn0X" // Измените на безопасный пароль!
  const name = "Администратор"

  try {
    // Проверяем, существует ли уже админ
    const existingAdmin = await prisma.user.findUnique({
      where: { login },
    })

    if (existingAdmin) {
      console.log("Администратор уже существует!")
      console.log(`Логин: ${login}`)
      return
    }

    // Создаём админа
    const admin = await prisma.user.create({
      data: {
        login,
        email,
        password: await hash(password),
        name,
        role: "SUPERADMIN",
      },
    })

    console.log("✅ Администратор создан успешно!")
    console.log("================================")
    console.log(`Логин: ${login}`)
    console.log(`Пароль: ${password}`)
    console.log(`Email: ${email}`)
    console.log("================================")
    console.log("⚠️  Не забудьте сменить пароль!")
  } catch (error) {
    console.error("Ошибка создания администратора:", error)
  } finally {
    await prisma.$disconnect()
  }
}

createAdmin()
