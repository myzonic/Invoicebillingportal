import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

const email = (
  process.env.ADMIN_EMAIL ||
  process.env.SEED_ADMIN_EMAIL ||
  "myzonicllc@gmail.com"
)
  .toLowerCase()
  .trim();

const password = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;

async function main() {
  if (!password) {
    throw new Error(
      "Set ADMIN_PASSWORD (or SEED_ADMIN_PASSWORD) in the environment before running this script.",
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user found for ${email}`);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await bcrypt.hash(password, 10),
      isActive: true,
    },
  });

  console.log(`Password reset and account enabled for ${email}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
