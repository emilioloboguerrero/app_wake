import { motion } from 'motion/react';
import './OnboardingEducation.css';
import AuroraBackground from './components/AuroraBackground';

const ease = [0.22, 1, 0.36, 1];

// Actual Wake chevron path from svgviewer-output.svg (viewBox 0 0 4500 4500)
const WAKE_PATH = "M928.520691,4036.501465 C904.396301,4071.018311 880.174927,4103.685547 851.979858,4133.093262 C803.860107,4183.281738 749.429993,4224.162109 681.836975,4244.659180 C655.740784,4252.572266 629.657837,4260.865234 603.078857,4266.784668 C536.537720,4281.605957 468.972626,4287.957031 400.808044,4287.633301 C382.098511,4287.544434 363.545837,4285.429688 345.601990,4279.950195 C338.022400,4277.636230 330.471344,4274.635254 323.589996,4270.740723 C304.161346,4259.742676 294.057892,4242.605957 292.312592,4220.398438 C291.143250,4205.519043 294.235870,4191.272949 298.214264,4177.099609 C307.790527,4142.981934 322.484253,4110.941895 337.637970,4079.067139 C445.930786,3851.277832 554.233704,3623.493408 662.436218,3395.661377 C768.926453,3171.434814 875.305054,2947.155518 981.727112,2722.896484 C1057.903442,2562.373291 1134.040894,2401.831299 1210.250366,2241.323730 C1293.311157,2066.386475 1376.474609,1891.497559 1459.520996,1716.553101 C1539.713501,1547.620361 1619.773560,1378.624756 1699.965454,1209.691528 C1773.023315,1055.786987 1846.174438,901.926453 1919.295166,748.051575 C1960.427368,661.493286 2001.308838,574.814392 2042.821289,488.438751 C2070.507812,430.830688 2099.350342,373.782257 2131.870605,318.699158 C2145.421143,295.747192 2159.194580,272.909393 2178.993164,254.472107 C2200.929443,234.044159 2226.486084,223.253326 2256.731934,223.575897 C2280.562256,223.830048 2300.895752,232.420013 2318.429443,248.047119 C2329.922119,258.290070 2340.220215,269.733002 2347.894043,283.135223 C2366.745605,316.059998 2386.112061,348.730743 2403.737549,382.308960 C2452.317871,474.861328 2496.127930,569.767883 2541.292725,664.003906 C2589.616455,764.830750 2638.157471,865.553406 2686.498291,966.372192 C2739.440674,1076.788330 2792.211670,1187.286865 2845.151367,1297.704346 C2893.489258,1398.522827 2942.004883,1499.255615 2990.347412,1600.071899 C3043.291992,1710.486328 3096.096924,1820.967651 3149.021240,1931.391602 C3193.319092,2023.815918 3237.713135,2116.193848 3282.042480,2208.602783 C3327.521484,2303.407715 3372.960693,2398.231201 3418.440674,2493.035400 C3462.768555,2585.436768 3507.156006,2677.809570 3551.464355,2770.220459 C3608.433350,2889.037109 3665.333984,3007.886230 3722.293213,3126.707764 C3775.225342,3237.128418 3828.200439,3347.528320 3881.146973,3457.941895 C3929.776855,3559.354736 3978.399902,3660.770996 4027.015137,3762.190918 C4071.601074,3855.205322 4116.246582,3948.191162 4160.713379,4041.262207 C4178.207520,4077.878174 4197.526855,4113.697266 4210.708008,4152.240723 C4215.008789,4164.816406 4219.518555,4177.495605 4221.907227,4190.499023 C4224.045410,4202.140625 4224.824219,4214.434570 4223.656738,4226.187988 C4221.761230,4245.267090 4210.943359,4259.367188 4194.293457,4268.919434 C4179.630859,4277.332031 4163.661133,4281.673828 4147.097656,4284.145508 C4114.608398,4288.995117 4082.132080,4288.243164 4049.479004,4285.199219 C3977.775879,4278.515625 3909.850098,4258.649902 3844.239746,4229.507324 C3786.238525,4203.744141 3735.147949,4168.001465 3690.784668,4123.068359 C3576.568115,4007.382812 3476.861084,3880.357666 3392.812256,3740.975098 C3357.641846,3682.650146 3328.421143,3621.534912 3299.890381,3559.895020 C3181.087646,3303.226074 3061.946777,3046.714111 2942.914307,2790.151611 C2852.729736,2595.768066 2762.509277,2401.401123 2672.327393,2207.016357 C2556.941162,1958.304199 2441.577148,1709.581909 2326.206055,1460.862915 C2310.804199,1427.659180 2295.517334,1394.401611 2279.930176,1361.285278 C2277.136475,1355.350220 2274.182129,1348.836670 2269.504150,1344.553833 C2247.185791,1324.120361 2221.152100,1334.926636 2211.110596,1355.379028 C2202.901611,1372.099731 2195.300537,1389.118286 2187.374268,1405.978638 C2044.674927,1709.517822 1901.404541,2012.790039 1759.414551,2316.660645 C1608.125244,2640.431641 1457.619141,2964.570801 1307.664673,3288.962158 C1253.780029,3405.528564 1202.237793,3523.182373 1150.160156,3640.576660 C1131.007324,3683.750977 1113.814819,3727.772461 1092.446289,3769.987305 C1062.019897,3830.096924 1027.125732,3887.541016 990.250366,3943.825439 C970.172241,3974.471924 949.620544,4004.808350 928.520691,4036.501465z";

// Reusable Wake logo at any size
function WakeLogo({ size = 40, opacity = 0.9, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 4500 4500" style={style}>
      <path d={WAKE_PATH} fill={`rgba(255,255,255,${opacity})`} />
    </svg>
  );
}

// --- Option 1: Logo as head on minimal stick figure ---
function Doodle1() {
  return (
    <svg width="140" height="220" viewBox="0 0 140 220" fill="none">
      <motion.g initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
        <svg x="45" y="2" width="50" height="50" viewBox="0 0 4500 4500">
          <path d={WAKE_PATH} fill="rgba(255,255,255,0.9)" />
        </svg>
      </motion.g>
      {/* Body line */}
      <motion.line x1="70" y1="52" x2="70" y2="130" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease, delay: 0.3 }} />
      {/* Arms */}
      <motion.line x1="70" y1="78" x2="38" y2="105" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease, delay: 0.5 }} />
      <motion.line x1="70" y1="78" x2="102" y2="105" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease, delay: 0.5 }} />
      {/* Legs */}
      <motion.line x1="70" y1="130" x2="45" y2="178" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease, delay: 0.6 }} />
      <motion.line x1="70" y1="130" x2="95" y2="178" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease, delay: 0.6 }} />
      <text x="70" y="208" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="Montserrat" fontWeight="400">1 — Logo head, stick body</text>
    </svg>
  );
}

// --- Option 2: Logo on chest of a filled silhouette ---
function Doodle2() {
  return (
    <svg width="140" height="220" viewBox="0 0 140 220" fill="none">
      {/* Head */}
      <motion.circle cx="70" cy="28" r="18" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.5, ease }} />
      {/* Torso */}
      <motion.path
        d="M40 55 Q40 48 70 46 Q100 48 100 55 L103 135 Q103 148 92 148 L48 148 Q37 148 37 135 Z"
        fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.2 }} />
      {/* Logo on chest — white */}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.5 }}>
        <svg x="50" y="60" width="40" height="40" viewBox="0 0 4500 4500">
          <path d={WAKE_PATH} fill="rgba(255,255,255,0.7)" />
        </svg>
      </motion.g>
      {/* Arms */}
      <motion.path d="M40 60 L18 95 L12 88" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease, delay: 0.4 }} />
      <motion.path d="M100 60 L122 95 L128 88" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease, delay: 0.4 }} />
      {/* Legs */}
      <motion.path d="M55 148 L48 190 Q47 194 52 194" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.5 }} />
      <motion.path d="M85 148 L92 190 Q93 194 88 194" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.5 }} />
      <text x="70" y="208" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="Montserrat" fontWeight="400">2 — Logo on chest</text>
    </svg>
  );
}

// --- Option 3: Logo IS the full body shape (legs of chevron = legs of figure) ---
function Doodle3() {
  return (
    <svg width="140" height="220" viewBox="0 0 140 220" fill="none">
      {/* Small circle head above the chevron peak */}
      <motion.circle cx="70" cy="14" r="10" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.4, ease }} />
      {/* Wake logo as the full body — large */}
      <motion.g initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease, delay: 0.2 }}>
        <svg x="15" y="20" width="110" height="165" viewBox="0 0 4500 4500">
          <path d={WAKE_PATH} fill="rgba(255,255,255,0.8)" />
        </svg>
      </motion.g>
      {/* Arms from mid-body */}
      <motion.path d="M38 90 L12 112" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease, delay: 0.5 }} />
      <motion.path d="M102 90 L128 112" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease, delay: 0.5 }} />
      <text x="70" y="208" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="Montserrat" fontWeight="400">3 — Logo IS the body</text>
    </svg>
  );
}

// --- Option 4: Outline logo with face inside ---
function Doodle4() {
  return (
    <svg width="140" height="220" viewBox="0 0 140 220" fill="none">
      {/* Large Wake logo outline */}
      <motion.g initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease }}>
        <svg x="10" y="5" width="120" height="180" viewBox="0 0 4500 4500">
          <path d={WAKE_PATH} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.6)" strokeWidth="40" />
        </svg>
      </motion.g>
      {/* Eyes inside the upper area */}
      <motion.circle cx="58" cy="80" r="4" fill="rgba(255,255,255,0.85)"
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.3, delay: 0.6 }} />
      <motion.circle cx="82" cy="80" r="4" fill="rgba(255,255,255,0.85)"
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.3, delay: 0.65 }} />
      {/* Subtle smile */}
      <motion.path d="M62 92 Q70 99 78 92" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.8 }} />
      {/* Tiny feet */}
      <motion.ellipse cx="32" cy="186" rx="10" ry="5" fill="rgba(255,255,255,0.3)"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} />
      <motion.ellipse cx="108" cy="186" rx="10" ry="5" fill="rgba(255,255,255,0.3)"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} />
      <text x="70" y="208" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="Montserrat" fontWeight="400">4 — Character with face</text>
    </svg>
  );
}

// --- Option 5: Abstract — logo floats above a simple geometric body ---
function Doodle5() {
  return (
    <svg width="140" height="220" viewBox="0 0 140 220" fill="none">
      {/* Wake logo floating as head/soul */}
      <motion.g
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: [0, -4, 0] }}
        transition={{ opacity: { duration: 0.5 }, y: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }}
      >
        <svg x="40" y="0" width="60" height="60" viewBox="0 0 4500 4500">
          <path d={WAKE_PATH} fill="rgba(255,255,255,0.9)" />
        </svg>
      </motion.g>
      {/* Connecting energy line */}
      <motion.line x1="70" y1="58" x2="70" y2="72" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="3 3"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} />
      {/* Simple pill body */}
      <motion.rect x="42" y="72" width="56" height="75" rx="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease, delay: 0.3 }} />
      {/* Legs as simple lines */}
      <motion.line x1="56" y1="147" x2="50" y2="182" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.6 }} />
      <motion.line x1="84" y1="147" x2="90" y2="182" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.6 }} />
      {/* Arms */}
      <motion.line x1="42" y1="95" x2="22" y2="115" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.5 }} />
      <motion.line x1="98" y1="95" x2="118" y2="115" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.5 }} />
      <text x="70" y="208" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="Montserrat" fontWeight="400">5 — Floating logo head</text>
    </svg>
  );
}

// --- Option 6: Logo replaces torso in a proportioned figure ---
function Doodle6() {
  return (
    <svg width="140" height="220" viewBox="0 0 140 220" fill="none">
      {/* Round head */}
      <motion.circle cx="70" cy="20" r="14" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.6)" strokeWidth="2"
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.4, ease }} />
      {/* Neck */}
      <motion.line x1="70" y1="34" x2="70" y2="42" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.2, delay: 0.2 }} />
      {/* Wake logo AS the torso (the peak at top connects to neck, legs of V splay out) */}
      <motion.g initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.3 }}>
        <svg x="28" y="38" width="84" height="105" viewBox="0 0 4500 4500">
          <path d={WAKE_PATH} fill="rgba(255,255,255,0.75)" />
        </svg>
      </motion.g>
      {/* Arms from the shoulders (where the V starts to widen) */}
      <motion.path d="M42 60 L16 88 L10 80" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease, delay: 0.5 }} />
      <motion.path d="M98 60 L124 88 L130 80" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease, delay: 0.5 }} />
      {/* Lower legs extending from the chevron feet */}
      <motion.line x1="34" y1="142" x2="30" y2="180" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.7 }} />
      <motion.line x1="106" y1="142" x2="110" y2="180" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.7 }} />
      {/* Feet */}
      <motion.line x1="30" y1="180" x2="38" y2="180" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.2, delay: 0.85 }} />
      <motion.line x1="110" y1="180" x2="102" y2="180" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.2, delay: 0.85 }} />
      <text x="70" y="208" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="Montserrat" fontWeight="400">6 — Logo as torso</text>
    </svg>
  );
}

export default function DoodleTest() {
  return (
    <div className="pwa-ob-root" style={{ maxWidth: '100%', overflow: 'auto' }}>
      <AuroraBackground />
      <div className="pwa-ob-grid" />
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 20,
        padding: 24,
        maxWidth: 520,
        width: '100%',
      }}>
        {[Doodle1, Doodle2, Doodle3, Doodle4, Doodle5, Doodle6].map((Doodle, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            style={{ display: 'flex', justifyContent: 'center' }}
          >
            <Doodle />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
