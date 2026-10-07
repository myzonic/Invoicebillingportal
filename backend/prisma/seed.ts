import { PrismaClient, ModuleName } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

const seedConfig = {
  adminEmail: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
  adminName: process.env.SEED_ADMIN_NAME || "Portal Admin",
  defaultBrandName: process.env.DEFAULT_BRAND_NAME || process.env.COMPANY_NAME || "Your Company",
  companyName: process.env.COMPANY_NAME || "Your Company",
  companyEmail: process.env.COMPANY_EMAIL || "billing@example.com",
  companyWebsite: process.env.COMPANY_WEBSITE || "https://example.com",
};

const MODULES: ModuleName[] = [
  "dashboard",
  "clients",
  "invoices",
  "items",
  "brands",
  "merchants",
  "users",
  "roles",
  "logs",
];

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { name: "super-admin" },
    update: {},
    create: {
      name: "super-admin",
      description: "Full access to every module",
      isSystem: true,
      permissions: {
        create: MODULES.map((module) => ({
          module,
          canCreate: true,
          canRead: true,
          canUpdate: true,
          canDelete: true,
        })),
      },
    },
  });

  const staffRole = await prisma.role.upsert({
    where: { name: "staff" },
    update: {},
    create: {
      name: "staff",
      description: "Read + create on core modules",
      isSystem: true,
      permissions: {
        create: [
          { module: "dashboard", canRead: true },
          { module: "clients", canCreate: true, canRead: true, canUpdate: true },
          { module: "invoices", canCreate: true, canRead: true, canUpdate: true, canDelete: true },
          { module: "items", canCreate: true, canRead: true, canUpdate: true },
          { module: "brands", canRead: true },
          { module: "merchants", canCreate: true, canRead: true, canUpdate: true },
        ],
      },
    },
  });

  const email = seedConfig.adminEmail.toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
  const hashed = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name: seedConfig.adminName,
      password: hashed,
      roleId: adminRole.id,
    },
    create: { email, password: hashed, name: seedConfig.adminName, roleId: adminRole.id },
  });

  let seedBrand = await prisma.brand.findFirst({ where: { name: seedConfig.defaultBrandName } });
  if (!seedBrand) {
    seedBrand = await prisma.brand.create({
      data: {
        name: seedConfig.defaultBrandName,
        currency: "USD",
        email: seedConfig.companyEmail,
        isDefault: true,
      },
    });
  }

  const invite = await prisma.inviteToken.upsert({
    where: { token: process.env.INVITE_TOKEN || "dev-invite-token" },
    update: { roleId: adminRole.id, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) },
    create: {
      token: process.env.INVITE_TOKEN || "dev-invite-token",
      roleId: adminRole.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });

  await prisma.setting.upsert({
    where: { key: "company" },
    update: {},
    create: {
      key: "company",
      value: {
        name: seedConfig.companyName,
        email: seedConfig.companyEmail,
        phone: "",
        address: "",
        website: seedConfig.companyWebsite,
      },
    },
  });

  console.log("Seed complete:");
  console.log(`  admin email:   ${email}`);
  console.log(`  admin password: ${password}`);
  console.log(`  admin role:    super-admin (${adminRole.id})`);
  console.log(`  staff role:    ${staffRole.id}`);
  console.log(`  default brand: ${seedBrand.id}`);
  console.log(`  invite token:  ${invite.token}`);
  console.log("  NOTE: change SEED_ADMIN_PASSWORD and INVITE_TOKEN in production.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
