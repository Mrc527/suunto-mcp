/**
 * Suunto App activity ids and point of interest types.
 *
 * Workouts (`activityId`), routes (`activityIds`) and points of interest (`activityId`) use the
 * Suunto App activity ids, not the FIT sport ids. The table below is copied from Suunto's
 * official activity list "Activities.pdf" (linked from the workout API page of the Suunto API
 * Zone, https://apizone.suunto.com), as collected in docs/suunto-api.md section 8. Id 89 is not
 * in the list. A few names use the spacing of the Suunto web site ("Scuba diving" where the PDF
 * writes "Scubadiving"); the PDF spellings are accepted as aliases.
 */

export interface Activity {
  id: number;
  name: string;
}

/** Every known activity id with its English name. */
export const ACTIVITIES: ReadonlyArray<Activity> = Object.freeze([
  { id: 0, name: "Walking" },
  { id: 1, name: "Running" },
  { id: 2, name: "Cycling" },
  { id: 3, name: "Cross-country skiing" },
  { id: 4, name: "Sports" },
  { id: 5, name: "Sports" },
  { id: 6, name: "Sports" },
  { id: 7, name: "Sports" },
  { id: 8, name: "Sports" },
  { id: 9, name: "Sports" },
  { id: 10, name: "Mountain biking" },
  { id: 11, name: "Hiking" },
  { id: 12, name: "Roller skating" },
  { id: 13, name: "Downhill skiing" },
  { id: 14, name: "Paddling" },
  { id: 15, name: "Rowing" },
  { id: 16, name: "Golfing" },
  { id: 17, name: "Indoor sports" },
  { id: 18, name: "Parkouring" },
  { id: 19, name: "Ball games" },
  { id: 20, name: "Outdoor gym" },
  { id: 21, name: "Swimming" },
  { id: 22, name: "Trail running" },
  { id: 23, name: "Gym" },
  { id: 24, name: "Nordic walking" },
  { id: 25, name: "Horseback riding" },
  { id: 26, name: "Motorsports" },
  { id: 27, name: "Skateboarding" },
  { id: 28, name: "Water sports" },
  { id: 29, name: "Climbing" },
  { id: 30, name: "Snowboarding" },
  { id: 31, name: "Ski touring" },
  { id: 32, name: "Fitness class" },
  { id: 33, name: "Soccer" },
  { id: 34, name: "Tennis" },
  { id: 35, name: "Basketball" },
  { id: 36, name: "Badminton" },
  { id: 37, name: "Baseball" },
  { id: 38, name: "Volleyball" },
  { id: 39, name: "American football" },
  { id: 40, name: "Table tennis" },
  { id: 41, name: "Racquet ball" },
  { id: 42, name: "Squash" },
  { id: 43, name: "Floorball" },
  { id: 44, name: "Handball" },
  { id: 45, name: "Softball" },
  { id: 46, name: "Bowling" },
  { id: 47, name: "Cricket" },
  { id: 48, name: "Rugby" },
  { id: 49, name: "Ice skating" },
  { id: 50, name: "Ice hockey" },
  { id: 51, name: "Yoga/pilates" },
  { id: 52, name: "Indoor cycling" },
  { id: 53, name: "Treadmill" },
  { id: 54, name: "Crossfit" },
  { id: 55, name: "Crosstrainer" },
  { id: 56, name: "Roller skiing" },
  { id: 57, name: "Indoor rowing" },
  { id: 58, name: "Stretching" },
  { id: 59, name: "Track and field" },
  { id: 60, name: "Orienteering" },
  { id: 61, name: "Standup paddling" },
  { id: 62, name: "Combat sport" },
  { id: 63, name: "Kettlebell" },
  { id: 64, name: "Dancing" },
  { id: 65, name: "Snow shoeing" },
  { id: 66, name: "Frisbee golf" },
  { id: 67, name: "Futsal" },
  { id: 68, name: "Multisport" },
  { id: 69, name: "Aerobics" },
  { id: 70, name: "Trekking" },
  { id: 71, name: "Sailing" },
  { id: 72, name: "Kayaking" },
  { id: 73, name: "Circuit training" },
  { id: 74, name: "Triathlon" },
  { id: 75, name: "Padel" },
  { id: 76, name: "Cheerleading" },
  { id: 77, name: "Boxing" },
  { id: 78, name: "Scuba diving" },
  { id: 79, name: "Freediving" },
  { id: 80, name: "Adventure racing" },
  { id: 81, name: "Gymnastics" },
  { id: 82, name: "Canoeing" },
  { id: 83, name: "Mountaineering" },
  { id: 84, name: "Telemark skiing" },
  { id: 85, name: "Open water swimming" },
  { id: 86, name: "Windsurfing" },
  { id: 87, name: "Kitesurfing" },
  { id: 88, name: "Paragliding" },
  { id: 90, name: "Snorkeling" },
  { id: 91, name: "Surfing" },
  { id: 92, name: "Swimrun" },
  { id: 93, name: "Duathlon" },
  { id: 94, name: "Aquathlon" },
  { id: 95, name: "Obstacle racing" },
  { id: 96, name: "Fishing" },
  { id: 97, name: "Hunting" },
  { id: 98, name: "Transition" },
  { id: 99, name: "Gravel cycling" },
  { id: 100, name: "Mermaiding" },
  { id: 101, name: "Spearfishing" },
  { id: 102, name: "Jump rope" },
  { id: 103, name: "Track running" },
  { id: 104, name: "Calisthenics" },
  { id: 105, name: "E-biking" },
  { id: 106, name: "E-mtb" },
  { id: 107, name: "Backcountry skiing" },
  { id: 108, name: "Wheelchair sport" },
  { id: 109, name: "Hand cycling" },
  { id: 110, name: "Splitboarding" },
  { id: 111, name: "Biathlon" },
  { id: 112, name: "Meditation" },
  { id: 113, name: "Field hockey" },
  { id: 114, name: "Cyclocross" },
  { id: 115, name: "Vertical running" },
  { id: 116, name: "Ski mountaineering" },
  { id: 117, name: "Skate skiing" },
  { id: 118, name: "Classic skiing" },
  { id: 119, name: "Chores" },
  { id: 120, name: "Pilates" },
  { id: 121, name: "Yoga" },
]);

const BY_ID = new Map<number, string>(ACTIVITIES.map((a) => [a.id, a.name]));

/**
 * A lookup key that ignores case, spaces and punctuation: "Cross-country skiing",
 * "cross country skiing" and "CrossCountrySkiing" give the same key.
 */
export function lookupKey(text: string): string {
  return text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "Running" for 1; "Activity 999" for an id that is not in the list (never a guess). */
export function activityName(id: number | null | undefined): string {
  if (id === null || id === undefined || !Number.isFinite(id)) return "Unknown activity";
  return BY_ID.get(id) ?? `Activity ${id}`;
}

/** True when the id is in Suunto's list. */
export function isKnownActivity(id: number): boolean {
  return BY_ID.has(id);
}

// Families used by the sport filter. A family word wins over an activity of the same name, so
// "running" also finds trail, treadmill, track and vertical runs; the exact activity alone can
// still be asked for by its id (for example "1"). The name of the activity a family is named after
// (Running, Cycling, Cross-country skiing, ...) must be in the family's alias row.
const RUNNING = [1, 22, 53, 103, 115];
const CYCLING = [2, 10, 52, 99, 105, 106, 114];
const MOUNTAIN_BIKING = [10, 106];
const SWIMMING = [21, 85];
const HIKING = [11, 70];
const WALKING = [0, 24];
const SKIING = [3, 13, 31, 84, 107, 116, 117, 118];
const XC_SKIING = [3, 117, 118];
const SKI_TOURING = [31, 107, 116];
const DIVING = [78, 79];
const GYM = [23, 20];
const STRENGTH = [23, 20, 54, 63, 73, 104];
const YOGA = [51, 121];
const PILATES = [51, 120];
const ROWING = [15, 57];
const PADDLING = [14, 61, 72, 82];
const MULTISPORT = [68, 74, 92, 93, 94];

/** Alias -> activity ids. Keys are written in plain words; they are matched with lookupKey(). */
const ALIAS_LIST: ReadonlyArray<[string[], number[]]> = [
  [["run", "runs", "running", "jog", "jogging", "runner"], RUNNING],
  [["road run", "road running"], [1]],
  [["trail", "trail run", "trail runs", "trail running", "trailrun"], [22]],
  [["treadmill run", "treadmill running", "indoor run", "indoor running"], [53]],
  [["track", "track run"], [103]],
  [["vertical run", "vertical"], [115]],
  [["bike", "biking", "cycle", "cycling", "ride", "rides", "riding", "bicycle"], CYCLING],
  [["road bike", "road cycling", "road biking"], [2]],
  [["mtb", "mountain bike", "mountain biking", "mountainbike"], MOUNTAIN_BIKING],
  [["gravel", "gravel bike", "gravel ride"], [99]],
  [["ebike", "e bike", "electric bike"], [105, 106]],
  [["indoor bike", "indoor ride", "spinning", "spin", "home trainer", "turbo trainer"], [52]],
  [["swim", "swims", "swimming"], SWIMMING],
  [["pool", "pool swim", "pool swimming", "indoor swimming"], [21]],
  [["open water", "open water swim", "openwater", "openwater swimming", "ows", "outdoor swimming"], [85]],
  [["hike", "hikes", "hiking"], HIKING],
  [["trek", "trekking"], [70]],
  [["walk", "walks", "walking"], WALKING],
  [["nordic walk", "nordic walking"], [24]],
  [["ski", "skis", "skiing"], SKIING],
  // "Cross-country skiing" is also the name of activity 3: as a filter it means the whole family.
  [["xc ski", "xc skiing", "xc", "cross country", "cross country ski", "cross country skiing", "nordic ski", "nordic skiing", "langlauf"], XC_SKIING],
  [["skate ski", "skating ski", "skating skiing"], [117]],
  [["classic ski", "classic cross country skiing"], [118]],
  [["downhill", "downhill ski", "alpine", "alpine ski", "alpine skiing", "piste"], [13]],
  [["ski tour", "ski touring", "skitour", "skimo", "backcountry", "randonnee"], SKI_TOURING],
  [["telemark", "telemarkskiing"], [84]],
  [["snowboard", "snowboarding"], [30, 110]],
  [["splitboard", "split board", "split boarding"], [110]],
  [["snowshoe", "snowshoeing", "snowshoes"], [65]],
  [["dive", "dives", "diving"], DIVING],
  [["scuba", "scuba dive", "scubadiving"], [78]],
  [["freedive", "free diving", "apnea"], [79]],
  [["snorkel", "snorkelling"], [90]],
  [["gym", "workout gym"], GYM],
  [["strength", "strength training", "weights", "weight training", "lifting", "weightlifting"], STRENGTH],
  [["yoga"], YOGA],
  [["pilates"], PILATES],
  [["row", "rowing"], ROWING],
  [["indoor row", "erg", "rowing machine"], [57]],
  [["paddle", "paddling"], PADDLING],
  [["sup", "stand up paddle", "stand up paddling", "paddleboard"], [61]],
  [["kayak"], [72]],
  [["canoe"], [82]],
  [["climb", "climbing", "bouldering"], [29]],
  [["triathlon", "tri"], [74]],
  [["multisport", "multi sport"], MULTISPORT],
  [["golf"], [16]],
  [["hockey"], [50, 113]],
  [["football"], [33, 39]],
  [["martial arts", "combat"], [62, 77]],
  [["dance", "dancing"], [64]],
  [["elliptical", "cross trainer", "crosstrainer"], [55]],
  [["skipping", "jumping rope"], [102]],
  [["kite", "kiteboarding", "kitesurf"], [87]],
  [["windsurf"], [86]],
  [["surf"], [91]],
  [["sail"], [71]],
  [["wheelchair"], [108]],
  [["parkour"], [18]],
  [["indoor"], [17]],
];

const ALIASES = new Map<string, readonly number[]>();
for (const [words, ids] of ALIAS_LIST) {
  for (const word of words) {
    const key = lookupKey(word);
    if (!ALIASES.has(key)) ALIASES.set(key, Object.freeze([...ids]));
  }
}

const BY_NAME = new Map<string, number[]>();
for (const a of ACTIVITIES) {
  const key = lookupKey(a.name);
  const list = BY_NAME.get(key) ?? [];
  list.push(a.id);
  BY_NAME.set(key, list);
}

/**
 * The activity ids a sport filter means: an alias (run, bike, ride, swim, ski, hike, walk, dive,
 * gym, ...), an exact activity name ("Trail running"; case, spaces and punctuation do not matter)
 * or an activity id ("22"). [] when the text matches nothing.
 */
export function activityIdsFor(nameOrAlias: string): number[] {
  const text = nameOrAlias.trim();
  if (/^\d{1,4}$/.test(text)) return [Number(text)];
  const key = lookupKey(text);
  if (!key) return [];
  const alias = ALIASES.get(key);
  if (alias) return [...alias];
  return [...(BY_NAME.get(key) ?? [])];
}

/**
 * One activity id for a name (for a point of interest or a route): the exact activity name
 * first, then an id, then the first activity of an alias. undefined when unknown.
 */
export function activityIdFor(name: string): number | undefined {
  const text = name.trim();
  const exact = BY_NAME.get(lookupKey(text));
  if (exact?.length) return exact[0];
  return activityIdsFor(text)[0];
}

/** A few sport names for help texts and error messages. */
export const SPORT_EXAMPLES: readonly string[] = Object.freeze([
  "run",
  "trail",
  "bike",
  "mtb",
  "swim",
  "pool",
  "open water",
  "hike",
  "walk",
  "ski",
  "xc ski",
  "dive",
  "gym",
  "strength",
  "yoga",
  "row",
  "paddle",
  "Trail running",
  "Scuba diving",
]);

// ---------------------------------------------------------------------------------------------
// Points of interest
// ---------------------------------------------------------------------------------------------

/** Suunto's PoiType values (from the PoiType schema of the Suunto Point of Interest API). */
export const POI_TYPES: ReadonlyArray<{ id: number; name: string }> = Object.freeze([
  { id: -1, name: "Unknown" },
  { id: 0, name: "Building" },
  { id: 1, name: "Home" },
  { id: 2, name: "Car" },
  { id: 3, name: "Parking" },
  { id: 4, name: "Camp" },
  { id: 5, name: "Camping" },
  { id: 6, name: "Food" },
  { id: 7, name: "Restaurant" },
  { id: 8, name: "Cafe" },
  { id: 9, name: "Lodging" },
  { id: 10, name: "Hostel" },
  { id: 11, name: "Hotel" },
  { id: 12, name: "Water" },
  { id: 13, name: "River" },
  { id: 14, name: "Lake" },
  { id: 15, name: "Coast" },
  { id: 16, name: "Mountain" },
  { id: 17, name: "Hill" },
  { id: 18, name: "Valley" },
  { id: 19, name: "Cliff" },
  { id: 20, name: "Forest" },
  { id: 21, name: "Crossroads" },
  { id: 22, name: "Sight" },
  { id: 23, name: "Begin" },
  { id: 24, name: "End" },
  { id: 25, name: "Geocache" },
  { id: 26, name: "POI" },
  { id: 27, name: "Road" },
  { id: 28, name: "Trail" },
  { id: 29, name: "Rock" },
  { id: 30, name: "Meadow" },
  { id: 31, name: "Cave" },
  { id: 32, name: "Emergency" },
  { id: 33, name: "Information" },
  { id: 34, name: "Peak" },
  { id: 35, name: "Waterfall" },
  { id: 36, name: "FishingSpot" },
  { id: 37, name: "Bedding" },
  { id: 38, name: "Prints" },
  { id: 39, name: "Rub" },
  { id: 40, name: "Scrape" },
  { id: 41, name: "Stand" },
  { id: 42, name: "TrailCam" },
  { id: 43, name: "BigGame" },
  { id: 44, name: "SmallGame" },
  { id: 45, name: "Bird" },
  { id: 46, name: "Shot" },
  { id: 47, name: "Fish" },
  { id: 64, name: "BigFish" },
  { id: 65, name: "CoralReef" },
  { id: 66, name: "Beach" },
  { id: 67, name: "MarineMammals" },
  { id: 68, name: "KelpForest" },
  { id: 69, name: "Lagoon" },
  { id: 70, name: "Wreck" },
  { id: 71, name: "MarineReserve" },
  { id: 72, name: "Avalanche" },
  { id: 73, name: "Danger" },
  { id: 74, name: "AidStation" },
  { id: 75, name: "WaterPoint" },
  { id: 76, name: "Mushrooms" },
  { id: 77, name: "Campfire" },
]);

/** The generic type ("POI"), used when a call names none. */
export const DEFAULT_POI_TYPE = 26;

const POI_BY_ID = new Map<number, string>(POI_TYPES.map((t) => [t.id, t.name]));
const POI_BY_KEY = new Map<string, number>(POI_TYPES.map((t) => [lookupKey(t.name), t.id]));
// Other words people (and Suunto's GPX waypoint types) use for the same types.
const POI_ALIASES: ReadonlyArray<[string, number]> = [
  ["info", 33],
  ["summit", 34],
  ["top", 34],
  ["generic", 26],
  ["point", 26],
  ["point of interest", 26],
  ["waypoint", 26],
  ["start", 23],
  ["finish", 24],
  ["shelter", 4],
  ["hut", 9],
  ["spring", 75],
  ["fountain", 75],
  ["drinking water", 75],
  ["viewpoint", 22],
  ["view", 22],
  ["aid", 74],
  ["fishing", 36],
  ["trailcamera", 42],
  ["coral", 65],
  ["mammals", 67],
  ["kelp", 68],
  ["shipwreck", 70],
  ["reserve", 71],
  ["junction", 21],
  ["intersection", 21],
  ["fire", 77],
];
for (const [word, id] of POI_ALIASES) {
  const key = lookupKey(word);
  if (!POI_BY_KEY.has(key)) POI_BY_KEY.set(key, id);
}

/** "Peak" for 34; "Type 99" for a type that is not in the list. */
export function poiTypeName(id: number): string {
  return POI_BY_ID.get(id) ?? `Type ${id}`;
}

/** The PoiType of a name (case, spaces and punctuation do not matter; "fishing spot" works), or an id ("34"). */
export function poiTypeId(name: string): number | undefined {
  const text = name.trim();
  if (/^-?\d{1,3}$/.test(text)) {
    const id = Number(text);
    return POI_BY_ID.has(id) ? id : undefined;
  }
  return POI_BY_KEY.get(lookupKey(text));
}
