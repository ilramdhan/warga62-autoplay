/**
 * Card facts relevant for decisions. Deck sizes: 56 takdir, 36 musibah, 14 krisis (added to the
 * musibah deck once the crisis phase starts), 10 simpanan (keep cards, max 3 held).
 * Only cards that need a player decision or change long-term rules are listed in detail.
 */

export const DECK_SIZES = { takdir: 56, musibah: 36, krisis: 14, simpanan: 10 };

/** Keep cards ("kartu Simpanan"). id -> when it is useful. */
export const KEEP_CARDS = {
  'restu-ibu': { name: 'Restu Ibu', use: 'Batalkan satu kartu Apes yang baru ditarik.' },
  'orang-dalam': { name: 'Orang Dalam', use: 'Keluar Lapas seketika, atau batalkan putusan Pengadilan.' },
  'joki-dadu': { name: 'Joki Dadu', use: 'Setelah lempar, ubah satu dadu jadi angka apa pun.' },
  'voucher-tol': { name: 'Voucher Tol', use: 'Lewat Gerbang Tol gratis.' },
  'flash-sale': { name: 'Flash Sale Tanggal Kembar', use: 'Beli satu kota kosong setengah harga.' },
  'numpang-dulu': { name: 'Numpang Dulu', use: 'Sewa berikutnya gratis.' },
  pengacara: { name: 'Pengacara Kenalan', use: 'Di Pengadilan lempar dua kali, ambil hasil terbaik.' },
  asuransi: { name: 'Asuransi Seadanya', use: 'Batalkan kerugian uang satu kartu Musibah.' },
  'juru-parkir': { name: 'Kenalan Juru Parkir', use: 'Bebas sekali dari Parkiran Liar / pungli.' },
  'surat-rt': { name: 'Surat Keterangan RT', use: 'Lolos sekali dari Razia.' },
};

/** Cards whose effect needs a choice/pick from the drawing player. */
export const INTERACTIVE_CARDS = [
  { id: 'takdir-03', title: 'Promo cicilan 0%', effect: { type: 'free_upgrade', levels: 1 } },
  {
    id: 'takdir-18',
    title: 'Tetangga pindah, rumahnya dijual murah',
    effect: { type: 'buy_any_unowned', discountPercent: 30 },
  },
  {
    id: 'takdir-40',
    title: 'Sertifikat ganda',
    effect: { type: 'dice_table', note: '1-4 bayar 500rb; 5-6 rebut kota lawan tanpa bangunan (pilih)' },
  },
  {
    id: 'musibah-17',
    title: 'Tanah jadi rebutan ahli waris',
    effect: { type: 'choice', options: ['bayar 800rb ke Negara', 'kota termurah disita Negara tanpa ganti rugi'] },
  },
  {
    id: 'musibah-35',
    title: 'Ditawari jalur cepat izin usaha',
    effect: { type: 'choice', options: ['bayar 500rb', 'lewati 2 giliran'] },
  },
  {
    id: 'krisis-03',
    title: 'Proyek strategis',
    effect: { type: 'seize_property', mode: 'state_cheapest', compensationPercent: 30 },
  },
  { id: 'krisis-08', title: 'Pinjol ditertibkan', effect: { type: 'rule_change', rule: 'disable_pinjol' } },
  { id: 'krisis-10', title: 'Inflasi', effect: { type: 'rule_change', rule: 'rent_multiplier', value: 1.25 } },
  {
    id: 'krisis-11',
    title: 'Gerbang tol baru diresmikan',
    effect: { type: 'convert_tile', from: 'cheapest_unowned', to: 'toll_gate' },
  },
  {
    id: 'krisis-13',
    title: 'Pungli makin terorganisir di Jabar',
    effect: { type: 'rule_change', rule: 'province_landing_fee', province: 'jabar', value: 100_000 },
  },
];
