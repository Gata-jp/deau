const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const matches = await prisma.match.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      status: true,
      meetupAt: true,
      createdAt: true,
    },
  });
  console.log(JSON.stringify(matches, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
