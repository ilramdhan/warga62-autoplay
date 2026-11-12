/**
 * Logger ringan: setiap pesan dikirim sebagai event `{type:'log', level, msg, ts}` lewat `emit`.
 * Pesan untuk pengguna ditulis dalam Bahasa Indonesia.
 */

/**
 * @param {(event: object) => void} emit
 * @param {{debug?: boolean}} [opts]
 */
export function createLogger(emit, opts = {}) {
  let debugOn = !!opts.debug;
  const send = (level, msg) => {
    try {
      emit?.({ type: 'log', level, msg: String(msg), ts: Date.now() });
    } catch {
      // host bermasalah tidak boleh menghentikan bot
    }
  };
  return {
    info: (msg) => send('info', msg),
    warn: (msg) => send('warn', msg),
    error: (msg) => send('error', msg),
    debug: (msg) => {
      if (debugOn) send('debug', msg);
    },
    setDebug: (v) => {
      debugOn = !!v;
    },
  };
}
