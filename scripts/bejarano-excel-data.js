'use strict';

/**
 * Excel session data for Bejarano seed — separated from main seed script.
 *
 * Inputs:
 *   excel_bejarano/parsed/_sessions.json  (produced by parse-bejarano-sessions.js)
 *
 * Outputs a single array of sessions matching the same shape the main seed uses:
 *   { title, exercises: [{ name, notes?, alt?, sets: [{ title, reps, intensity, order }] }] }
 *
 * All exercise names are resolved to library keys via NAME_MAP (caller applies resolveName).
 */

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────
// English → Spanish library key mappings (Excel-sourced names).
// These extend the main NAME_MAP; caller merges them.

const EXCEL_NAME_MAP = {
  // ── Pierna compuestos ──
  'BACK SQUAT':                          'SENTADILLA TRASERA',
  'PAUSA ABAJO SQUAT':                   'SENTADILLA TRASERA',          // + notes
  'PAUSA ABAJO SQUAT (MENOS PESO':       'SENTADILLA TRASERA',          // + notes
  'PAUSA ABAJO HACK SQUAT':              'SENTADILLA HACK',
  'PAUSA ABAJO BULGARIAN SPLIT SQ':      'SENTADILLA BÚLGARA',
  'HACK SQUAT':                          'SENTADILLA HACK',
  'BULGARIAN SPLIT SQUAT':               'SENTADILLA BÚLGARA',
  'GOBLET SQUAT':                        'SENTADILLA GOBLET',
  'SENTADILLA BULGARA':                  'SENTADILLA BÚLGARA',
  'FRONT SQUAT':                         'SENTADILLA FRONTAL',
  'LEG PRESS':                           'PRENSA DE PIERNA',
  'WALKING LUNGE':                       'ESTOCADA CAMINANDO (LUNGES)',
  'DB STEP-UP':                          'STEP UPS',

  // ── Cadena posterior ──
  'DEADLIFT':                            'PESO MUERTO',
  'BARBELL RUMANIAN DEAD LIFT':          'PESO MUERTO RUMANO (RDL)',
  'BARBELL RDL':                         'PESO MUERTO RUMANO (RDL)',
  'DB RUMANIAN DEADLIFT':                'PESO MUERTO RUMANO (RDL)',    // + notes "mancuernas"
  '1 LEG DEADLIFT':                      'PESO MUERTO RUMANO (RDL)',    // + notes "una pierna"
  'GOOD MORNING':                        'BUENOS DÍAS CON BARRA',
  '45° HYPEREXTENSION':                  'HIPEREXTENSIÓN 45°',
  '45 HYPEREXTENSION':                   'HIPEREXTENSIÓN 45°',

  // ── Glúteos / cadera ──
  'BARBELL HIP THRUST':                  'HIP THRUST CON BARRA',
  'FROG PUMP':                           'FROG PUMP',
  'FROG-PUMPS':                          'FROG PUMP',
  'PULL THROUGH':                        'PULL THROUGH',
  'MACHINE SEATED HIP ABDUCTION':        'ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA',
  'PLATE HIP ABDUCTION':                 'ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA',   // + notes "con disco"
  'CABLE HIP ABDUCTION':                 'ABDUCCIÓN DE CADERA EN POLEA',
  'CABLE GLUTE KICKBACK':                'PATADA DE GLÚTEO EN POLEA',
  'CABLE GLUTE KICK BACK':               'PATADA DE GLÚTEO EN POLEA',
  'CABLE ABDUCTION':                     'ABDUCCIÓN DE CADERA EN POLEA',
  'KETTLEBELL SWING':                    'KETTLEBELL SWING',
  'KETTLEBELL SWING ':                   'KETTLEBELL SWING',
  'BARBELL HIP THRUST CON PAUSA ARRIBA DE 3S': 'HIP THRUST CON BARRA',
  'REVERESE HYPER':                      'HIPEREXTENSIÓN 45°',       // typo in source
  'QUADRUPET HIDRANT':                   'ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA',  // typo "quadruped hydrant" — map to glute abd

  // ── Cuádriceps / isquios ──
  'LEG EXTENSION':                       'EXTENSION DE CUADRICEPS',
  'LYING LEG CURL':                      'CURL DE PIERNA ACOSTADO',
  'SEATED LEG CURL':                     'CURL DE PIERNA SENTADO',
  'NORDIC HAM CURL':                     'CURL DE PIERNA NÓRDICO',
  'SLIDING LEG CURL':                    'CURL DE PIERNA DESLIZANTE',
  'CURL NORDICO':                        'CURL DE PIERNA NÓRDICO',

  // ── Pantorrillas ──
  'SEATED CALF RAISE':                   'ELEVACIONES DE TALONES CON RODILLA FLEXIONADA',
  'STANDING CALF RAISE':                 'ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA',
  'LEG PRESS CALF RAISE':                'ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA',   // + notes "en prensa"
  'ELEVACION DE TALON PARADO':           'ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA',
  'ELEVACIONES DE TALON PARADO':         'ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA',

  // ── Pectoral ──
  'BENCH PRESS':                         'PRESS DE BANCA PLANA',
  'BENCH PRESS PIES ENCIMA BANCO':       'PRESS DE BANCA PLANA',        // + notes "pies sobre el banco"
  'DB BENCH PRESS':                      'PRESS DE BANCA PLANA',        // + notes "con mancuernas"
  'MACHINE CHEST PRESS':                 'PRESS EN MÁQUINA PLANO',
  'BARBELL INCLINE PRESS':               'PRESS DE BANCA INCLINADO',
  'CLOSE-GRIP DB INCLINE PRESS':         'PRESS INCLINADO AGARRE CERRADO',
  'PEC DECK':                            'PEC DEC (APERTURAS EN MÁQUINA)',
  'DB FLYE':                             'VUELOS PARA PECTORAL CON MANCUERNAS',
  'CABLE PEC FLYE':                      'VUELOS EN POLEA',
  'CABLE PEC FLYE (ABAJO HACIA ARRIBA)': 'VUELOS PARA PECTORAL EN POLEA (DE ABAJO A ARRIBA)',
  'PECFLY ARRIBA ABAJO':                 'VUELOS PARA PECTORAL EN POLEA (DE ARRIBA A ABAJO)',
  'PUSH-UP':                             'FLEXIONES (PUSH UPS)',
  'PUSH UP':                             'FLEXIONES (PUSH UPS)',
  'KNEELING MODIFIED PUSH UP':           'FLEXIONES (PUSH UPS)',        // + notes "de rodillas"
  'CLOSE-GRIP PUSH UP':                  'DIAMOND PUSH UP',
  'DIAMOND PUSH UP':                     'DIAMOND PUSH UP',
  'PIKE PUSH UP':                        'PRESS EN PINO (PIKE PUSH UPS)',
  'PIKE PUSH UPS':                       'PRESS EN PINO (PIKE PUSH UPS)',
  'FLEXIONES INCLINADAS':                'FLEXIONES (PUSH UPS)',        // + notes "inclinadas"
  'FLEXIONES CON DÉFICIT':               'FLEXIONES CON DÉFICIT',
  'APERTURAS EN PISO':                   'VUELOS PARA PECTORAL CON MANCUERNAS',    // + notes "en piso"
  'PUSH UPS SPIDERMAN':                  'FLEXIONES (PUSH UPS)',        // + notes "spiderman"

  // ── Espalda vertical ──
  'LAT PULLDOWN':                        'JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)',
  'MACHINE PULLDOWN':                    'JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)',
  'PULL-UP':                             'DOMINADA PRONO',
  'PULL UP':                             'DOMINADA PRONO',
  'CHIN UP':                             'DOMINADA SUPINA (CHIN UPS)',
  '1-ARM LAT PULL-DOWN':                 'JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)',   // + notes "una mano"
  '1-ARM LAT PULL-IN':                   'JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)',   // + notes "a una mano"
  'CABLE PULLOVER':                      'PULL OVER EN POLEA',
  'DB PULLOVER':                         'PULL OVER EN POLEA',          // + notes "con mancuerna"

  // ── Espalda horizontal ──
  'CHEST-SUPPORTED ROW':                 'REMO CON APOYO EN PECHO EN MÁQUINA',
  'SEAL ROW':                            'SEAL ROW',
  'CABLE SEATED ROW':                    'REMO EN CABLE AGARRE NEUTRO',
  '1-ARM SEATED ROW':                    'REMO EN CABLE AGARRE NEUTRO', // + notes "unilateral"
  'SINGLE-ARM SEATED ROW':               'REMO EN CABLE AGARRE NEUTRO', // + notes "unilateral"
  'DB ROW':                              'REMO UNILATERAL CON MANCUERNA',
  'MEADOWS ROW':                         'REMO EN BARRA T',
  'REMO UNLITAREAL ARODILLADO':          'REMO UNILATERAL CON MANCUERNA',   // typo in source
  'REMO UNILATERAL':                     'REMO UNILATERAL CON MANCUERNA',
  'REMO UNILATERAL ARRODILLADO':         'REMO UNILATERAL CON MANCUERNA',
  'REMO INVERTIDO':                      'REMO INVERTIDO',
  'REMO INVERTIDO CON SÁBANA':           'REMO INVERTIDO',              // + notes "con sábana (casa)"
  'REMO MENTÓN':                         'REMO AL MENTÓN',

  // ── Hombros ──
  'MACHINE SHOULDER PRESS':              'PRESS MILITAR EN MÁQUINA',
  'SEATED DB SHOULDER PRESS':            'PRESS MILITAR CON MANCUERNA SENTADO',
  'SEATED BARBELL SHOULDER PRESS':       'PRESS MILITAR EN BARRA SENTADO',
  'CABLE LATERAL RAISE':                 'ELEVACIONES LATERALES DE HOMBRO EN CABLE',
  'DB LATERAL RAISE':                    'ELEVACIONES LATERALES DE HOMBRO MANCUERNA',
  'MACHINE LATERAL RAISE':               'ELEVACIONES LATERALES DE HOMBRO MÁQUINA',
  'PLATE FRONT RAISE':                   'ELEVACIONES FRONTALES',
  'DB FRONT RAISE':                      'ELEVACIONES FRONTALES',
  'CABLE FRONT RAISE':                   'ELEVACIONES FRONTALES',       // + notes "en cable"
  'ELEVACION LATERAL ISOMETRICA':        'ELEVACIONES LATERALES DE HOMBRO MANCUERNA',
  'ELEVACION LATERAL INDIVIDUAL':        'ELEVACIONES LATERALES DE HOMBRO MANCUERNA',

  // ── Hombros — posterior ──
  'FACE PULL':                           'FACE PULL',
  'REVERSE PEC DECK':                    'VUELOS INVERTIDOS EN MÁQUINA',
  'REVERSE CABLE FLYE':                  'VUELOS INVERTIDOS EN POLEA',
  'BENT-OVER REVERSE DB FLYE':           'VUELOS INVERTIDOS CON MANCUERNA',

  // ── Traps ──
  'DB SHRUG':                            'ENCOGIMIENTO DE HOMBROS',
  'PLATE SHRUG':                         'ENCOGIMIENTO DE HOMBROS',
  'CABLE SHRUG-IN':                      'ENCOGIMIENTO DE HOMBROS',     // + notes "en cable"

  // ── Bíceps ──
  'PREACHER CURL':                       'CURL DE BÍCEPS PREDICADOR',
  'BICEP CURL':                          'CURL DE BÍCEPS EN BARRA',
  'DB CURL':                             'CURL DE BÍCEPS INCLINADO',    // default
  'DB INCLINE CURL':                     'CURL DE BÍCEPS INCLINADO',
  'CABLE CURL':                          'CURL DE BÍCEPS BAYESIAN',
  'SPIDER CURL':                         'CURL DE BÍCEPS SPIDERMAN',
  'BAYESIAN CURL':                       'CURL DE BÍCEPS BAYESIAN',
  'CURL BICEPS':                         'CURL DE BÍCEPS EN BARRA',
  'CURL BICEPS CONCENTRADO':             'CURL DE BÍCEPS CONCENTRADO',
  'CURL ACOSTADO TOALLA':                'CURL DE PIERNA ACOSTADO',     // + notes "con toalla"

  // ── Tríceps ──
  'TRICEPS PRESSDOWN':                   'TRICEP PUSH DOWN',
  'SINGLE-ARM TRICEP PRESSDOWN':         'TRICEP PUSH DOWN',            // + notes "unilateral"
  'SINGLE-ARM CABLE TRICEP KICKBACK':    'PATADA DE TRÍCEPS',
  'OVERHEAD TRICEPS EXTENSION':          'EXTENSIÓN DE TRÍCEPS SOBRE CABEZA',
  'SKULL CRUSHER':                       'PRESS FRANCES CON MANCUERNAS',
  'DB SKULL CRUSHER':                    'PRESS FRANCES CON MANCUERNAS',

  // ── Core ──
  'AB WHEEL':                            'RUEDA ABDOMINAL',
  'V SIT-UP':                            'CRUNCH DOBLE EN V',
  'V SITUP':                             'CRUNCH DOBLE EN V',
  'DOBLE CRUNCH':                        'CRUNCH DOBLE EN V',
  'HANGING LEG RAISE':                   'ELEVACIONES DE PIERNAS (ABS)',
  'CABLE CRUNCH':                        'CRUNCH EN CABLE',
  'MACHINE CRUNCH':                      'CRUNCH EN CABLE',             // + notes "en máquina"
  'DECLINE PLATE-WEIGHTED CRUNCH':       'CRUNCH CONVENCIONAL',         // + notes "declinado con peso"
  'REVERSE CRUNCH':                      'CRUNCH CONVENCIONAL',         // + notes "invertido"
  'ROMAN CHAIR LEG RAISE':               'ELEVACIONES DE PIERNAS (ABS)',// + notes "silla romana"
  'PALLOF PRESS':                        'PALLOF PRESS',
  'PLANK':                               'PLANCHA (PLANK)',
  'CRUNCH EN BICICLETA':                 'CRUNCH CONVENCIONAL',         // + notes "bicicleta"

  // ── Bodyweight / Casa ──
  'ESCALADORES':                         'ESCALADORES',
  'ENTERRADORAS':                        'ENTERRADORAS',
  'SENTADILLA GOBLET':                   'SENTADILLA GOBLET',

  // ── Home file — Spanish variants / typos ──
  'FLEXIONES CON DEFICIT':               'FLEXIONES CON DÉFICIT',   // accent stripped
  'HIP THRUST UNA PIERNA':               'HIP THRUST UNILATERAL CON MANCUERNA',
  'ELEV. TALÓN PARADO':                  'ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA',
  'ELEVACIONES DE TALÓN PARADO':         'ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA',
  'CURL BICEPS, CONCENTRADO':            'CURL DE BÍCEPS CONCENTRADO',
  'PESO MUERTO RUMANO':                  'PESO MUERTO RUMANO (RDL)',
  'FONDOS':                              'FONDOS EN PARALELAS',
  'CURL NÓRDICO':                        'CURL DE PIERNA NÓRDICO',
  'EXTENCIÓN CUÁDRICEPS':                'EXTENSION DE CUADRICEPS',    // typo in source
  'PULL OVER':                           'PULL OVER EN POLEA',
  'ELEVACIÓN LATERAL ISOMÉTRICA':        'ELEVACIONES LATERALES DE HOMBRO MANCUERNA',
  'ELEVACIÓN LATERAL INDIVIDUAL':        'ELEVACIONES LATERALES DE HOMBRO MANCUERNA',
  'ABDUCCIÓN CON PESO':                  'ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA',
  'PAUSA ABAJO SQUAT (MENOS PESO QUE ANTERIOR)': 'SENTADILLA TRASERA',
  'BENCH PRESS (PIES ENCIMA DE BANCO)':  'PRESS DE BANCA PLANA',
  'PECFLY (ARRIBA ABAJO)':               'VUELOS PARA PECTORAL EN POLEA (DE ARRIBA A ABAJO)',
};

// Notes to append when using a mapped base exercise — the "variant cue".
const EXCEL_NOTE_OVERRIDES = {
  'PAUSA ABAJO SQUAT':                   'Pausa abajo',
  'PAUSA ABAJO SQUAT (MENOS PESO':       'Pausa abajo (menos peso)',
  'PAUSA ABAJO HACK SQUAT':              'Pausa abajo',
  'PAUSA ABAJO BULGARIAN SPLIT SQ':      'Pausa abajo',
  'DB RUMANIAN DEADLIFT':                'Con mancuernas',
  '1 LEG DEADLIFT':                      'A una pierna',
  'PLATE HIP ABDUCTION':                 'Con disco',
  'LEG PRESS CALF RAISE':                'En prensa',
  'BENCH PRESS PIES ENCIMA BANCO':       'Pies sobre el banco',
  'DB BENCH PRESS':                      'Con mancuernas',
  'KNEELING MODIFIED PUSH UP':           'De rodillas',
  'FLEXIONES INCLINADAS':                'Inclinadas',
  'APERTURAS EN PISO':                   'En piso',
  'PUSH UPS SPIDERMAN':                  'Spiderman',
  '1-ARM LAT PULL-DOWN':                 'Una mano',
  '1-ARM LAT PULL-IN':                   'A una mano',
  'DB PULLOVER':                         'Con mancuerna',
  '1-ARM SEATED ROW':                    'Unilateral',
  'SINGLE-ARM SEATED ROW':               'Unilateral',
  'REMO INVERTIDO CON SÁBANA':           'Con sábana (casa)',
  'CABLE FRONT RAISE':                   'En cable',
  'CABLE SHRUG-IN':                      'En cable',
  'SINGLE-ARM TRICEP PRESSDOWN':         'Unilateral',
  'MACHINE CRUNCH':                      'En máquina',
  'DECLINE PLATE-WEIGHTED CRUNCH':       'Declinado con peso',
  'REVERSE CRUNCH':                      'Invertido',
  'ROMAN CHAIR LEG RAISE':               'Silla romana',
  'CURL ACOSTADO TOALLA':                'Con toalla (casa)',
  'CRUNCH EN BICICLETA':                 'Bicicleta',
  'ELEVACION LATERAL ISOMETRICA':        'Isométrica',
  'ELEVACION LATERAL INDIVIDUAL':        'Unilateral',
  'BARBELL HIP THRUST CON PAUSA ARRIBA DE 3S': 'Pausa arriba 3s',
  'REVERESE HYPER':                      'Reverse hyper',
  'QUADRUPET HIDRANT':                   'Patrón cuadrúpedo',
  'ELEVACIÓN LATERAL ISOMÉTRICA':        'Isométrica',
  'ELEVACIÓN LATERAL INDIVIDUAL':        'Unilateral',
  'ABDUCCIÓN CON PESO':                  'Con peso',
  'PAUSA ABAJO SQUAT (MENOS PESO QUE ANTERIOR)': 'Pausa abajo (menos peso)',
  'BENCH PRESS (PIES ENCIMA DE BANCO)':  'Pies sobre el banco',
  'PECFLY (ARRIBA ABAJO)':               'De arriba a abajo',
  'HIP THRUST UNA PIERNA':               'Unilateral',
};

// Source title → user-facing library title. Key = "<file>|<raw-title>".
const TITLE_MAP = {
  'Reporte_EntrenoCasa.json|DÍA 1 /// Full Body 1': 'Full body en casa 1',
  'Reporte_EntrenoCasa.json|DÍA 2 /// Full Body 2': 'Full body en casa 2',
  'Reporte_EntrenoCasa.json|DÍA 3 /// Full Body 3': 'Full body en casa 3',
  'Reporte_EntrenoCasa.json|DÍA 4 /// Full Body 4': 'Full body en casa 4',
  'Reporte_EntrenoCasa.json|DÍA 5 /// Full Body 5': 'Full body en casa 5',

  'Rutina_3 DIAS FULL BODY.json|DIA 1 /// FULL BODY 1': 'Full body gym — sentadilla y chest row',
  'Rutina_3 DIAS FULL BODY.json|DIA 2 /// FULL BODY 2': 'Full body gym — banca y RDL',
  'Rutina_3 DIAS FULL BODY.json|DIA 3 /// FULL BODY 3': 'Full body gym — pulldown y lunge',

  'Rutina_4 DIAS UL - UL.json|DIA 1 /// LEGS 1': 'Pierna — back squat y RDL',
  'Rutina_4 DIAS UL - UL.json|DIA 2 /// UPPER 1': 'Tren superior — banca y chest row',
  'Rutina_4 DIAS UL - UL.json|DIA 3 /// LEGS 2': 'Pierna — peso muerto y prensa',
  'Rutina_4 DIAS UL - UL.json|DIA 4 /// UPPER 2': 'Tren superior — incline y dominada',

  'Rutina_5 DIAS PPL - UL.json|DIA 1 /// LEGS 1': 'Pierna — back squat y RDL',         // shared with UL
  'Rutina_5 DIAS PPL - UL.json|DIA 2 /// PUSH':   'Empuje — banca pies arriba',
  'Rutina_5 DIAS PPL - UL.json|DIA 3 /// PULL':   'Jalón — pulldown y chest row',
  'Rutina_5 DIAS PPL - UL.json|DIA 4 /// LEGS 2': 'Pierna — peso muerto y prensa',     // shared with UL
  'Rutina_5 DIAS PPL - UL.json|DIA 5 /// UPPER':  'Tren superior — completo',

  'Rutina_GluteOptimization x5 .json|DIA 1 /// LEGS 1':          'Glúteos — sentadilla y RDL',
  'Rutina_GluteOptimization x5 .json|DIA 2 /// PUSH 1':          'Glúteos — tren superior 1',
  'Rutina_GluteOptimization x5 .json|DIA 3 /// LEGS 2':          'Glúteos — hip thrust e hiperextensión',
  'Rutina_GluteOptimization x5 .json|DIA 4 /// PULL 1':          'Glúteos — tren superior 2',
  'Rutina_GluteOptimization x5 .json|DIA 5 /// OPCIONAL: LEGS 2':'Glúteos — pierna opcional',

  'Rutina_PushPullLegs .json|DIA 1 /// LEGS 1':  'Pierna — back squat y RDL',         // shared with UL
  'Rutina_PushPullLegs .json|DIA 2 /// PUSH 1':  'Empuje — banca pies arriba',        // dedupes with 5-day PUSH
  'Rutina_PushPullLegs .json|DIA 3 /// PULL 1':  'Jalón — pulldown y chest row',      // dedupes with 5-day PULL
  'Rutina_PushPullLegs .json|DIA 4 /// LEGS 2':  'Pierna — peso muerto y prensa',     // shared with UL
  'Rutina_PushPullLegs .json|DIA 5 /// PUSH 2':  'Empuje — incline y diamond',
  'Rutina_PushPullLegs .json|DIA 6 /// PULL 2':  'Jalón — unilateral',

  'Rutina_Abdomen.json|RUTINA DE ABDOMEN PARA HACER 1 DIA DE POR MEDIO': 'Abdomen',
};

// Exercises to skip entirely when encountered (markers / metadata rows).
const SKIP_NAMES = new Set([
  'CARDIO',
  'CALENTAMIENTO',
  'COMANDOS',                             // no library mapping and not a real exercise in Felipe's core scheme
  'EJERCICIOS',                           // header / marker row
]);

// Ab Wheel reps cell in Abdomen got Excel-auto-converted to a date. Default.
const ABDOMEN_AB_WHEEL_DEFAULT_REPS = '10-15';

// ─────────────────────────────────────────────────────────────────────
// Intensity conversion — same as main seed:  (10 − rir) / 10  clamped.

function rirToIntensity(rir, isWarmup = false) {
  const n = typeof rir === 'number' ? rir : parseInt(String(rir).replace(/[^0-9]/g, ''), 10);
  if (isNaN(n)) return isWarmup ? '5/10' : '8/10';
  if (isWarmup) return `${Math.max(3, Math.min(6, 6 - Math.max(0, 3 - n)))}/10`;
  return `${Math.max(7, Math.min(10, 10 - n))}/10`;
}

const WARMUP_RAMPS = {
  0: [], 1: ['5/10'], 2: ['4/10', '6/10'], 3: ['3/10', '5/10', '6/10'], 4: ['3/10', '4/10', '5/10', '6/10'],
};

function buildSets(cal, work, reps, rir) {
  const workIntensity = rirToIntensity(rir, false);
  const ramps = WARMUP_RAMPS[cal] || Array(cal).fill('5/10');
  const out = [];
  for (let i = 0; i < cal; i++) {
    out.push({ order: out.length, title: `Cal ${i + 1}`, reps: String(reps), intensity: ramps[i] });
  }
  for (let i = 0; i < work; i++) {
    out.push({ order: out.length, title: `Serie ${i + 1}`, reps: String(reps), intensity: workIntensity });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Main export — produces the array of sessions ready for the main seed writer.

function loadExcelSessions() {
  const parsed = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'excel_bejarano', 'parsed', '_sessions.json'), 'utf-8')
  );

  const out = [];
  const dedupeKey = new Map();  // content-signature → session index in `out`
  const warnings = [];

  for (const raw of parsed.all) {
    // Skip obvious metadata / noise
    if (!raw.title || raw.exercises.length < 2) continue;
    if (/^BB=/i.test(raw.exercises[0]?.name || '')) continue; // "BB= Barra o Barbell…" metadata row

    const key = `${raw.source}|${raw.title}`;
    const title = TITLE_MAP[key];
    if (!title) {
      warnings.push(`no title mapping for: ${key}`);
      continue;
    }

    const isHome = raw.source === 'Reporte_EntrenoCasa.json';

    const exercises = [];
    for (const rawEx of raw.exercises) {
      const upper = (rawEx.name || '').toUpperCase().trim();
      if (SKIP_NAMES.has(upper)) continue;
      if (!rawEx.name) continue;

      const mapped = EXCEL_NAME_MAP[upper];
      const noteFromMap = EXCEL_NOTE_OVERRIDES[upper];

      // Fix Abdomen Ab Wheel reps (Excel auto-date conversion)
      let reps = rawEx.reps;
      if (raw.source === 'Rutina_Abdomen.json' && upper === 'AB WHEEL' && /\d{4}-\d{2}-\d{2}/.test(String(reps))) {
        reps = ABDOMEN_AB_WHEEL_DEFAULT_REPS;
      }
      if (!reps && raw.source === 'Rutina_5 DIAS PPL - UL.json' && upper === 'REMO UNLITAREAL ARODILLADO') {
        reps = '10';  // missing cell in source; reasonable default
      }

      // Determine cal/work sets + reps + rir
      let cal = 0, work = 0, rir = 2;
      if (isHome) {
        work = rawEx.sets || 3;
        // RIR in home may be text like "Intensidad Media" → default to 2
        const rirNum = parseInt(String(rawEx.rir).replace(/[^0-9]/g, ''), 10);
        rir = isNaN(rirNum) ? 2 : Math.max(0, Math.min(3, rirNum));
      } else {
        cal = rawEx.cal || 0;
        work = rawEx.work || 3;
        rir = Math.max(0, Math.min(3, rawEx.rir ?? 2));
      }

      // NOTE: intentionally drop Excel SUSTITUTO 1/2 — they are Felipe's template placeholders
      // (often cross-domain, e.g. "Step Up" listed as sub for Pallof Press). The curated
      // ALTERNATIVES map in seed-felipe-sessions.js supplies movement-pattern-correct alts.

      exercises.push({
        name: mapped || rawEx.name,
        rawName: rawEx.name,
        mapped: !!mapped,
        code: rawEx.code || null,  // superset code like A1, B2
        notes: noteFromMap || (rawEx.code && /[A-Z][12]/.test(rawEx.code) ? rawEx.code : undefined),
        sets: buildSets(cal, work, reps, rir),
      });
    }

    if (exercises.length === 0) continue;

    const contentSig = `${title}||${exercises.map(e => e.name).join(',')}`;
    if (dedupeKey.has(contentSig)) continue;
    dedupeKey.set(contentSig, out.length);

    out.push({ title, exercises, source: raw.source });
  }

  return { sessions: out, warnings };
}

module.exports = { loadExcelSessions, EXCEL_NAME_MAP, EXCEL_NOTE_OVERRIDES, TITLE_MAP };

if (require.main === module) {
  const { sessions, warnings } = loadExcelSessions();
  console.log(`\nEXCEL SESSIONS: ${sessions.length}\n`);
  for (const s of sessions) {
    console.log(`[${s.source}]  "${s.title}"  (${s.exercises.length} ex)`);
    for (const ex of s.exercises) {
      const flag = ex.mapped ? ' ' : '⚠';
      const alt = ex.alt ? `  sub=[${ex.alt.join(' | ')}]` : '';
      const notes = ex.notes ? `  notes="${ex.notes}"` : '';
      console.log(`  ${flag}  ${(ex.code || ' ').padEnd(3)} ${ex.rawName.padEnd(36)} → ${ex.name}${notes}${alt}`);
    }
    console.log('');
  }
  if (warnings.length) {
    console.log(`\nWARNINGS (${warnings.length}):`);
    warnings.forEach(w => console.log('  ' + w));
  }
}
