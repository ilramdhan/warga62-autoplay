/**
 * Static board data for Warga +62 (rules version 0.1).
 * Numbers are game facts taken from the in-game rules definition. Index = tile position (0..47).
 * If the game updates its rules, regenerate this file (see docs/game-reference.md).
 */

export const RUPIAH = { rb: 1e3, jt: 1e6 };

/** @typedef {'aceh'|'ntt'|'sumbar'|'sumsel'|'jateng'|'diy'|'sulsel'|'sumut'|'bali'|'jatim'|'jabar'|'dki'} ProvinceId */

/** @type {Record<ProvinceId, {name:string, price:number, rent:[number,number,number,number], upgradeCost:number, tiles:number[]}>} */
export const PROVINCES = {
  aceh: {
    name: 'Aceh',
    price: 500_000,
    rent: [100_000, 300_000, 600_000, 1_000_000],
    upgradeCost: 250_000,
    tiles: [1, 2, 3],
  },
  ntt: {
    name: 'NTT',
    price: 500_000,
    rent: [100_000, 300_000, 600_000, 1_000_000],
    upgradeCost: 250_000,
    tiles: [5, 6, 7],
  },
  sumbar: {
    name: 'Sumbar',
    price: 700_000,
    rent: [140_000, 420_000, 840_000, 1_400_000],
    upgradeCost: 350_000,
    tiles: [9, 10, 11],
  },
  sumsel: {
    name: 'Sumsel',
    price: 700_000,
    rent: [140_000, 420_000, 840_000, 1_400_000],
    upgradeCost: 350_000,
    tiles: [13, 14, 15],
  },
  jateng: {
    name: 'Jateng',
    price: 900_000,
    rent: [180_000, 540_000, 1_080_000, 1_800_000],
    upgradeCost: 450_000,
    tiles: [17, 18, 19],
  },
  diy: {
    name: 'DIY',
    price: 900_000,
    rent: [180_000, 540_000, 1_080_000, 1_800_000],
    upgradeCost: 450_000,
    tiles: [21, 22, 23],
  },
  sulsel: {
    name: 'Sulsel',
    price: 1_100_000,
    rent: [220_000, 660_000, 1_320_000, 2_200_000],
    upgradeCost: 550_000,
    tiles: [25, 26, 27],
  },
  sumut: {
    name: 'Sumut',
    price: 1_100_000,
    rent: [220_000, 660_000, 1_320_000, 2_200_000],
    upgradeCost: 550_000,
    tiles: [29, 30, 31],
  },
  bali: {
    name: 'Bali',
    price: 1_400_000,
    rent: [280_000, 840_000, 1_680_000, 2_800_000],
    upgradeCost: 700_000,
    tiles: [33, 34, 35],
  },
  jatim: {
    name: 'Jatim',
    price: 1_400_000,
    rent: [280_000, 840_000, 1_680_000, 2_800_000],
    upgradeCost: 700_000,
    tiles: [37, 38, 39],
  },
  jabar: {
    name: 'Jabar',
    price: 1_600_000,
    rent: [320_000, 960_000, 1_920_000, 3_200_000],
    upgradeCost: 800_000,
    tiles: [41, 42, 43],
  },
  dki: {
    name: 'DKI Jakarta',
    price: 1_800_000,
    rent: [360_000, 1_080_000, 2_160_000, 3_600_000],
    upgradeCost: 900_000,
    tiles: [45, 46, 47],
  },
};

/** Building levels: 0 = Tanah kavling, 1 = KPR Subsidi, 2 = Dua KPR Subsidi, 3 = Perumahan Elit. */
export const LEVEL_NAMES = ['Tanah kavling', 'KPR Subsidi', 'Dua KPR Subsidi', 'Perumahan Elit'];
export const MAX_LEVEL = 3;

/**
 * @typedef {{kind:'start'|'city'|'takdir'|'musibah'|'tax'|'jail'|'toll'|'parking'|'raid'|'court', name:string, province?:ProvinceId, city?:string}} Tile
 * @type {Tile[]}
 */
export const TILES = [
  { kind: 'start', name: 'START' },
  { kind: 'city', name: 'Banda Aceh', province: 'aceh', city: 'banda-aceh' },
  { kind: 'city', name: 'Lhokseumawe', province: 'aceh', city: 'lhokseumawe' },
  { kind: 'city', name: 'Sabang', province: 'aceh', city: 'sabang' },
  { kind: 'takdir', name: 'Takdir' },
  { kind: 'city', name: 'Kupang', province: 'ntt', city: 'kupang' },
  { kind: 'city', name: 'Ende', province: 'ntt', city: 'ende' },
  { kind: 'city', name: 'Labuan Bajo', province: 'ntt', city: 'labuan-bajo' },
  { kind: 'tax', name: 'Pajak Tahunan' },
  { kind: 'city', name: 'Padang', province: 'sumbar', city: 'padang' },
  { kind: 'city', name: 'Bukittinggi', province: 'sumbar', city: 'bukittinggi' },
  { kind: 'city', name: 'Payakumbuh', province: 'sumbar', city: 'payakumbuh' },
  { kind: 'jail', name: 'Lapas' },
  { kind: 'city', name: 'Palembang', province: 'sumsel', city: 'palembang' },
  { kind: 'city', name: 'Prabumulih', province: 'sumsel', city: 'prabumulih' },
  { kind: 'city', name: 'Lubuklinggau', province: 'sumsel', city: 'lubuklinggau' },
  { kind: 'musibah', name: 'Musibah' },
  { kind: 'city', name: 'Tegal', province: 'jateng', city: 'tegal' },
  { kind: 'city', name: 'Semarang', province: 'jateng', city: 'semarang' },
  { kind: 'city', name: 'Solo', province: 'jateng', city: 'solo' },
  { kind: 'toll', name: 'Gerbang Tol Barat' },
  { kind: 'city', name: 'Bantul', province: 'diy', city: 'bantul' },
  { kind: 'city', name: 'Sleman', province: 'diy', city: 'sleman' },
  { kind: 'city', name: 'Kota Yogyakarta', province: 'diy', city: 'kota-yogyakarta' },
  { kind: 'parking', name: 'Parkiran Liar' },
  { kind: 'city', name: 'Palopo', province: 'sulsel', city: 'palopo' },
  { kind: 'city', name: 'Parepare', province: 'sulsel', city: 'parepare' },
  { kind: 'city', name: 'Makassar', province: 'sulsel', city: 'makassar' },
  { kind: 'takdir', name: 'Takdir' },
  { kind: 'city', name: 'Binjai', province: 'sumut', city: 'binjai' },
  { kind: 'city', name: 'Pematangsiantar', province: 'sumut', city: 'pematangsiantar' },
  { kind: 'city', name: 'Medan', province: 'sumut', city: 'medan' },
  { kind: 'raid', name: 'Razia' },
  { kind: 'city', name: 'Gianyar', province: 'bali', city: 'gianyar' },
  { kind: 'city', name: 'Badung', province: 'bali', city: 'badung' },
  { kind: 'city', name: 'Denpasar', province: 'bali', city: 'denpasar' },
  { kind: 'court', name: 'Pengadilan' },
  { kind: 'city', name: 'Sidoarjo', province: 'jatim', city: 'sidoarjo' },
  { kind: 'city', name: 'Malang', province: 'jatim', city: 'malang' },
  { kind: 'city', name: 'Surabaya', province: 'jatim', city: 'surabaya' },
  { kind: 'musibah', name: 'Musibah' },
  { kind: 'city', name: 'Bogor', province: 'jabar', city: 'bogor' },
  { kind: 'city', name: 'Depok', province: 'jabar', city: 'depok' },
  { kind: 'city', name: 'Bandung', province: 'jabar', city: 'bandung' },
  { kind: 'toll', name: 'Gerbang Tol Timur' },
  { kind: 'city', name: 'Jakarta Timur', province: 'dki', city: 'jakarta-timur' },
  { kind: 'city', name: 'Jakarta Selatan', province: 'dki', city: 'jakarta-selatan' },
  { kind: 'city', name: 'Jakarta Pusat', province: 'dki', city: 'jakarta-pusat' },
];

export const BOARD_SIZE = TILES.length; // 48

export const TILE_RULES = {
  tax: { perProperty: 300_000, noProperty: 200_000, crisisPerProperty: 500_000 },
  toll: { fee: 500_000, crisisFee: 700_000 },
  parking: { fee: 1_000_000 },
  raid: { jailOn: [1, 2], fine: 500_000 },
  court: { win: { on: [5, 6], gain: 800_000 }, jailFine: { on: [3, 4], fine: 1_000_000 }, jailSeize: { on: [1, 2] } },
  jail: { maxTurns: 3 },
  maxRentMultiplier: 10,
};

/**
 * Difficulty table. Keys match `game.settings.difficulty`.
 * fee multiplier applies to tax, toll, parking and raid fine.
 */
export const DIFFICULTY = {
  easy: {
    label: 'Santai',
    salary: 1_500_000,
    rentMultiplier: 0.75,
    feeMultiplier: 0.5,
    crisisAfterPasses: 3,
    crisisRentEscalation: 0.15,
    buildingRefund: 0.75,
    mortgage: 0.6,
    redeem: 0.6,
    loanTurns: 4,
    pinjol: { uses: 2, max: 3_000_000, interest: 0.3, turns: 3 },
    takeoverMultiplier: 2.5,
    jailBail: 300_000,
    courtSeize: 0.25,
  },
  medium: {
    label: 'Normal',
    salary: 1_000_000,
    rentMultiplier: 1,
    feeMultiplier: 1,
    crisisAfterPasses: 2,
    crisisRentEscalation: 0.25,
    buildingRefund: 0.5,
    mortgage: 0.5,
    redeem: 0.6,
    loanTurns: 3,
    pinjol: { uses: 1, max: 2_000_000, interest: 0.5, turns: 2 },
    takeoverMultiplier: 2,
    jailBail: 500_000,
    courtSeize: 0.4,
  },
  hard: {
    label: 'Inflasi',
    salary: 800_000,
    rentMultiplier: 1.25,
    feeMultiplier: 1.5,
    crisisAfterPasses: 2,
    crisisRentEscalation: 0.35,
    buildingRefund: 0.5,
    mortgage: 0.5,
    redeem: 0.7,
    loanTurns: 3,
    pinjol: { uses: 1, max: 1_500_000, interest: 0.75, turns: 2 },
    takeoverMultiplier: 2,
    jailBail: 750_000,
    courtSeize: 0.5,
  },
  extreme: {
    label: 'Krismon',
    salary: 600_000,
    rentMultiplier: 1.5,
    feeMultiplier: 2,
    crisisAfterPasses: 1,
    crisisRentEscalation: 0.5,
    buildingRefund: 0.4,
    mortgage: 0.4,
    redeem: 0.8,
    loanTurns: 2,
    pinjol: null,
    takeoverMultiplier: 1.5,
    jailBail: 1_000_000,
    courtSeize: 0.6,
  },
};

/** Interest options a lender can offer (percent). */
export const LOAN_INTEREST_OPTIONS = [0, 10, 25, 50];

/** Perfect zone of the roll power bar (fraction of bar width). Cupu < 0.40. */
export const ROLL_ZONES = { cupuBelow: 0.4, perfectFrom: 0.85, perfectTo: 0.91 };

export const provinceOf = (tile) => TILES[tile]?.province ?? null;
export const isCity = (tile) => TILES[tile]?.kind === 'city';
export const cityTiles = () => TILES.map((t, i) => (t.kind === 'city' ? i : -1)).filter((i) => i >= 0);
