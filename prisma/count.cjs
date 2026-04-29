const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const [stations, users, availabilities, tags, userTags, matches, chatMessages] = await Promise.all([
    prisma.station.count(),
    prisma.user.count(),
    prisma.availability.count(),
    prisma.tag.count(),
    prisma.userTag.count(),
    prisma.match.count(),
    prisma.chatMessage.count(),
  ]);

  console.log(
    JSON.stringify(
      { stations, users, availabilities, tags, userTags, matches, chatMessages },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
