import { PrismaClient } from "../generated/client/index.js"

const prisma = new PrismaClient()

async function updateAdminRole() {
  const login = "admin"

  try {
    const user = await prisma.user.update({
      where: { login },
      data: { role: "SUPERADMIN" },
    })

    console.log("✅ Роль обновлена на SUPERADMIN!")
    console.log(`Пользователь: ${user.login}`)
    console.log(`Роль: ${user.role}`)
  } catch (error) {
    console.error("Ошибка обновления роли:", error)
  } finally {
    await prisma.$disconnect()
  }
}

updateAdminRole()
