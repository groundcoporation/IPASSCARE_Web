/** Zero/empty remains the existing unset-position convention for this Korean shuttle UI. */
export function spotPosition(lat: string, lng: string) {
  const latitude = Number(lat), longitude = Number(lng);
  return lat.trim() && lng.trim() && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude !== 0 && longitude !== 0 && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { lat: latitude, lng: longitude } : null;
}
