import { PrismaClient, ModuleName } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

const PORTAL_IDENTITY = "Crystal Reserve LLC";

const seedConfig = {
  adminEmail: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
  adminName: process.env.SEED_ADMIN_NAME || "Portal Admin",
  defaultBrandName: PORTAL_IDENTITY,
  companyName: PORTAL_IDENTITY,
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

  // The seed runs on every container start. Never overwrite an existing
  // admin's password here: doing so would silently revert a password change
  // made through the app on the next deploy/restart.
  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  const admin =
    existingAdmin ||
    (await prisma.user.create({
      data: { email, password: await bcrypt.hash(password, 10), name: seedConfig.adminName, roleId: adminRole.id },
    }));

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

  const inviteToken = process.env.INVITE_TOKEN || (process.env.NODE_ENV === "production" ? "" : "dev-invite-token");
  if (!inviteToken) throw new Error("INVITE_TOKEN must be set in production");
  const invite = await prisma.inviteToken.upsert({
    where: { token: inviteToken },
    update: { roleId: adminRole.id, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) },
    create: {
      token: inviteToken,
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
  console.log(`  admin email:   ${email}${existingAdmin ? " (exists, left unchanged)" : " (created)"}`);
  console.log(`  admin role:    super-admin (${adminRole.id})`);
  console.log(`  staff role:    ${staffRole.id}`);
  console.log(`  default brand: ${seedBrand.id}`);
  if (!existingAdmin) console.log("  initial password: value of SEED_ADMIN_PASSWORD (not logged for security).");
  console.log(`  invite token configured: ${Boolean(invite.token)}`);
  if (process.env.NODE_ENV === "production" && password === "ChangeMe123!") {
    console.warn("  WARNING: default SEED_ADMIN_PASSWORD is in use. Set a strong value.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
