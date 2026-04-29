const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const match = await prisma.match.findFirst({
    where: { status: "MATCHED", userBCheckedInAt: null },
    orderBy: { createdAt: "asc" },
  });

  if (!match) {
    console.log("NO_MATCH");
    return;
  }

  const updated = await prisma.match.update({
    where: { id: match.id },
    data: {
      meetupAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      userACheckedInAt: null,
      userBCheckedInAt: null,
      status: "MATCHED",
    },
    select: { id: true, userAId: true, status: true, meetupAt: true },
  });

  console.log(JSON.stringify(updated, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
