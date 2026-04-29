const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function utcDate(daysFromNow, hour, minute) {
  const now = new Date();
  const dt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromNow, hour, minute, 0, 0)
  );
  return dt;
}

async function main() {
  const seedNicknames = ["Aoi", "Riku", "Mio", "Haru"];

  await prisma.availability.deleteMany({
    where: { user: { nickname: { in: seedNicknames } } },
  });
  await prisma.userTag.deleteMany({
    where: { user: { nickname: { in: seedNicknames } } },
  });
  await prisma.user.deleteMany({
    where: { nickname: { in: seedNicknames } },
  });

  const stationSeeds = [
    {
      externalCode: "ST_SHINJUKU",
      name: "新宿",
      lineName: "JR山手線",
      operatorName: "JR東日本",
      latitude: 35.690921,
      longitude: 139.700258,
    },
    {
      externalCode: "ST_SHIBUYA",
      name: "渋谷",
      lineName: "JR山手線",
      operatorName: "JR東日本",
      latitude: 35.658034,
      longitude: 139.701636,
    },
    {
      externalCode: "ST_TOKYO",
      name: "東京",
      lineName: "JR山手線",
      operatorName: "JR東日本",
      latitude: 35.681236,
      longitude: 139.767125,
    },
    {
      externalCode: "ST_IKEBUKURO",
      name: "池袋",
      lineName: "JR山手線",
      operatorName: "JR東日本",
      latitude: 35.728926,
      longitude: 139.71038,
    },
  ];

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
