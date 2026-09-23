/** Distance-based movement along supplied map roads. Cosmetic only: no traffic model. */
export function makeTrack(points) {
  const vertices = points.filter((point, index) => index === 0 || Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) > 1e-8);
  if (vertices.length < 2) return null;
  const distances = [0];
  for (let i = 1; i < vertices.length; i += 1) distances.push(distances[i - 1] + Math.hypot(vertices[i][0] - vertices[i - 1][0], vertices[i][1] - vertices[i - 1][1]));
  return { vertices, distances, length: distances.at(-1) };
}

export function sampleTrack(track, distance) {
  // Reflect at endpoints, keeping movement on the same observed road geometry.
  const loop = ((distance % (track.length * 2)) + track.length * 2) % (track.length * 2);
  const forward = loop <= track.length, along = forward ? loop : track.length * 2 - loop;
  let low = 1, high = track.distances.length - 1;
  while (low < high) { const mid = (low + high) >> 1; if (track.distances[mid] < along) low = mid + 1; else high = mid; }
  const a = track.vertices[low - 1], b = track.vertices[low], length = track.distances[low] - track.distances[low - 1];
  const fraction = Math.max(0, Math.min(1, (along - track.distances[low - 1]) / length)), direction = forward ? 1 : -1;
  return { x: a[0] + (b[0] - a[0]) * fraction, z: a[1] + (b[1] - a[1]) * fraction, dx: (b[0] - a[0]) / length * direction, dz: (b[1] - a[1]) / length * direction };
}
