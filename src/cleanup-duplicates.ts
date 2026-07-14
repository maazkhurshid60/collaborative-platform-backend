import dotenv from "dotenv";
dotenv.config();

import prisma from "./db/db.config";

async function main() {
  const shares = await prisma.formShare.findMany({
    orderBy: { createdAt: "desc" },
  });
  
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  
  for (const share of shares) {
    if (share.templateId && share.clientId) {
      const key = `${share.templateId}-${share.clientId}`;
      if (seen.has(key)) {
        duplicateIds.push(share.id);
      } else {
        seen.add(key);
      }
    }
  }
  
  console.log(`Found ${duplicateIds.length} duplicate FormShare entries.`);
  
  if (duplicateIds.length > 0) {
    const result = await prisma.formShare.deleteMany({
      where: { id: { in: duplicateIds } },
    });
    console.log(`Deleted ${result.count} duplicate entries from FormShare.`);
  }
}

main()
  .catch((err) => {
    console.error("Error during cleanup:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
