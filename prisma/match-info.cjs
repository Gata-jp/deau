const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const match = await prisma.match.findFirst({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      status: true,
      meetupAt: true,
    },
  });

  console.log(JSON.stringify(match, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
