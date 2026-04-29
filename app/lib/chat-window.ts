export function isChatWindowOpen(meetupAt: Date, now = new Date()): boolean {
  const oneHourAfter = new Date(meetupAt.getTime() + 60 * 60 * 1000);
  return now >= meetupAt && now <= oneHourAfter;
}
