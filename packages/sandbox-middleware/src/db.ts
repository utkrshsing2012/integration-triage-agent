import { PrismaClient } from "@prisma/client";

// One client per process. Connects as sandbox_app via DATABASE_URL.
export const prisma = new PrismaClient();
