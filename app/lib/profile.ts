export const PROFILE_PLACEHOLDER_BIRTHDATE = "1970-01-01";

type ProfileLike = {
  birthDate: Date;
  nearestStationId: string | null;
};

export function isProfileComplete(profile: ProfileLike): boolean {
  const birthDate = profile.birthDate.toISOString().slice(0, 10);
  return Boolean(profile.nearestStationId) && birthDate !== PROFILE_PLACEHOLDER_BIRTHDATE;
}
