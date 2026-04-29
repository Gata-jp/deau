const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const matchId = process.argv[2];

if (!matchId) {
  console.error("Usage: node prisma/set-meetup-now.cjs <matchId>");
  process.exit(1);
}

async function main() {
  const meetupAt = new Date(Date.now() - 5 * 60 * 1000);
  const updated = await prisma.match.update({
    where: { id: matchId },
    data: { meetupAt, status: "COMPLETED" },
    select: { id: true, meetupAt: true, status: true },
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
