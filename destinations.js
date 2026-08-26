// ReisSlim v1.4.5
// No fixed destination catalogue: live candidates are discovered from the
// user-specified start location. This avoids country/fixture lock-in.
export const destinations = [];
export const getDestination = id => destinations.find(destination => destination.id === id) || null;
