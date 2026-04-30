const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

function utcDate(daysFromNow, hour, minute) {
  const now = new Date();
  const dt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromNow, hour, minute, 0, 0)
  );
  return dt;
}

function parseStationsCsv() {
  const csvPath = path.join(__dirname, "..", "data", "stations-kanto.csv");
  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return [];

  const [header, ...rows] = lines;
  const columns = header.split(",");
  const index = Object.fromEntries(columns.map((name, i) => [name, i]));
  const allowedPrefectures = new Set(["東京都", "埼玉県", "神奈川県", "千葉県"]);

  return rows
    .map((row) => row.split(","))
    .filter((parts) => allowedPrefectures.has(parts[index.prefecture]))
    .map((parts) => ({
      externalCode: parts[index.externalCode],
      name: parts[index.name],
      kana: parts[index.kana] || null,
      lineName: parts[index.lineName] || null,
      operatorName: parts[index.operatorName] || null,
      latitude: parts[index.latitude] ? Number(parts[index.latitude]) : null,
      longitude: parts[index.longitude] ? Number(parts[index.longitude]) : null,
    }));
}

async function main() {
  const seedNicknames = ["Aoi", "Riku", "Mio", "Haru"];
  const seedUsers = await prisma.user.findMany({
    where: { nickname: { in: seedNicknames } },
    select: { id: true },
  });
  const seedUserIds = seedUsers.map((u) => u.id);

  if (seedUserIds.length > 0) {
    await prisma.chatMessage.deleteMany({
      where: {
        OR: [{ senderId: { in: seedUserIds } }, { match: { OR: [{ userAId: { in: seedUserIds } }, { userBId: { in: seedUserIds } }] } }],
      },
    });
    await prisma.match.deleteMany({
      where: {
        OR: [{ userAId: { in: seedUserIds } }, { userBId: { in: seedUserIds } }],
      },
    });
  }

  await prisma.availability.deleteMany({
    where: { user: { nickname: { in: seedNicknames } } },
  });
  await prisma.userTag.deleteMany({
    where: { user: { nickname: { in: seedNicknames } } },
  });
  await prisma.user.deleteMany({
    where: { nickname: { in: seedNicknames } },
  });

  const stationSeeds = parseStationsCsv();

  const stations = {};
  for (const st of stationSeeds) {
    const record = await prisma.station.upsert({
      where: { externalCode: st.externalCode },
      update: {
        name: st.name,
        lineName: st.lineName,
        operatorName: st.operatorName,
        latitude: st.latitude,
        longitude: st.longitude,
      },
      create: st,
    });
    stations[st.externalCode] = record;
  }

  const usersSeed = [
    {
      nickname: "Aoi",
      birthDate: new Date("1997-04-10"),
      gender: "FEMALE",
      preferenceGender: "MALE",
      nearestStationCode: "ST_SHIBUYA",
    },
    {
      nickname: "Riku",
      birthDate: new Date("1996-11-22"),
      gender: "MALE",
      preferenceGender: "FEMALE",
      nearestStationCode: "ST_SHINJUKU",
    },
    {
      nickname: "Mio",
      birthDate: new Date("1998-02-15"),
      gender: "FEMALE",
      preferenceGender: "MALE",
      nearestStationCode: "ST_IKEBUKURO",
    },
    {
      nickname: "Haru",
      birthDate: new Date("1995-08-30"),
      gender: "MALE",
      preferenceGender: "FEMALE",
      nearestStationCode: "ST_TOKYO",
    },
  ];

  const users = [];
  for (const u of usersSeed) {
    const user = await prisma.user.create({
      data: {
        nickname: u.nickname,
        birthDate: u.birthDate,
        gender: u.gender,
        preferenceGender: u.preferenceGender,
        nearestStationId: stations[u.nearestStationCode].id,
        matchingEnabled: true,
        matchWaitStartedAt: new Date(),
        isActive: true,
      },
    });
    users.push(user);
  }

  const slotAStart = utcDate(1, 12, 0);
  const slotAEnd = utcDate(1, 14, 0);
  const slotBStart = utcDate(2, 11, 0);
  const slotBEnd = utcDate(2, 13, 0);

  for (const user of users) {
    await prisma.availability.createMany({
      data: [
        { userId: user.id, startAt: slotAStart, endAt: slotAEnd, isBooked: false },
        { userId: user.id, startAt: slotBStart, endAt: slotBEnd, isBooked: false },
      ],
    });
  }

  const tagDating = await prisma.tag.upsert({
    where: { name: "恋愛" },
    update: {},
    create: { name: "恋愛" },
  });

  const tagCoffee = await prisma.tag.upsert({
    where: { name: "カフェ" },
    update: {},
    create: { name: "カフェ" },
  });

  for (const user of users) {
    await prisma.userTag.createMany({
      data: [
        { userId: user.id, tagId: tagDating.id },
        { userId: user.id, tagId: tagCoffee.id },
      ],
      skipDuplicates: true,
    });
  }

  console.log(
    JSON.stringify(
      {
        stations: Object.keys(stations).length,
        users: users.length,
        availabilitiesPerUser: 2,
        tags: 2,
      },
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
