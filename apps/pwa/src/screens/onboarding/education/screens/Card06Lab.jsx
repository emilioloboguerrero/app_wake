import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';

const ease = [0.22, 1, 0.36, 1];

// Front-view outline paths from the app's MuscleSilhouetteSVG (porfin.svg)
// viewBox 0 0 7996 8819 — rendered via a scaled <g> transform
const FRONT_OUTLINE_HEAD = "M1377.93 1269.23H1430.68L1461.78 1257.77L1494.22 1231.69L1529.82 1198.65L1576.95 1152.17L1619.9 1099.97L1661.23 1041.27L1685.46 999.197C1685.46 999.197 1685.46 968.208 1685.46 957.882C1685.46 947.556 1696.68 904.758 1696.68 904.758L1708.84 865.79H1746.38L1778.3 828.603L1801.48 781.965L1817.18 722.557L1827.52 659.139V606.687L1817.18 568.914L1801.48 554.289L1764.93 545.189H1746.38L1764.93 444.893V335.669L1746.38 260.986L1691.25 178.057L1619.9 109.689L1546.14 62.4323L1472.64 25.9495L1394.97 18.0449L1314.58 25.9495L1239.36 37.6836L1176.79 68.6194L1099.05 124.997L1043.93 186.218L1010.75 247.534L982.727 307.816L976.07 391.471L989.554 486.454L999.038 554.289L963.845 545.189L943.138 554.289L922.773 579.656L912.394 606.687V639.33V682.117L922.773 728.425L943.138 781.965L963.845 833.691L999.038 859.923L1037.21 865.79L1043.93 904.758L1051.97 957.882L1063.24 1013.46L1085.71 1047.5L1115.95 1092.08L1161.93 1142.86L1202.99 1192.26L1279.12 1242.13L1326.81 1269.23H1377.93Z";
const FRONT_OUTLINE_LEFT = "M1061.43 999.197L1066.47 1092.92L1078.5 1186.99V1251.66L991.666 1307.97L895.314 1359.95L793.596 1431.08L661.838 1513.07L531.06 1528.33L420.908 1554.62L328.821 1600.42L253.384 1655.97L187.723 1740.58L130.09 1849.36C130.09 1849.36 98.5872 1910.22 88.0858 1960.81C77.5854 2011.39 88.0858 2051.7 88.0858 2051.7V2185.19L103.449 2265.89L130.09 2347.94L151.15 2416.45L130.09 2487.22L103.449 2576.41L88.0858 2670.91L80.1617 2746.24V2886.79V2975.2L88.0858 3053.61L103.449 3121.96V3170.21L88.0858 3247.19L46.8737 3330.58L21.7638 3409.03L3.33398 3515.18V3635.83L21.7638 3785.68L46.8737 3923.76L68.5764 4041.01L88.0858 4148.5L103.449 4281.24L118.914 4380.79L130.09 4465.46L137.945 4539.49V4624.37L130.09 4675.34L118.914 4737.74L103.449 4821.64L88.0858 4879.62L80.1617 4904.23V5016.82L130.09 5087.53L205.801 5161.08L240.722 5212.66H292.051L391.986 5198.63L460.244 5161.08L476.326 5111.43L484.028 5078.67L540.577 5038.41L556.322 4960.33L540.577 4888.11L497.83 4795.47L460.244 4737.74L429.554 4675.34L412.479 4635.65L404.104 4512.06L391.986 4380.79L382.331 4291.53L391.986 4221.14L412.479 4141.5L448.426 4032.97L484.028 3904.28L531.06 3785.68L540.577 3674.49V3570.33V3493.95L515.127 3378.9L491.858 3275.38L484.028 3198.13L497.83 3104.6L531.06 3026.68L556.322 2933.17V2824.63L564.163 2688.76L576.111 2588.82V2462.55V2387.92V2371.27V2462.55L576.111 2588.82L597.639 2706.12L642.102 2832.36L684.39 2954.92L714.078 3026.68L745.474 3088.91V3138.48L735.553 3224.16L726.688 3310.83V3426.13L735.553 3473.02V3550.9L726.688 3581.09L703.144 3627.9L684.39 3710.94V3817.64L676.997 3904.28L661.838 4024.18L632.789 4154.56L609.683 4275.84L592.87 4393.17L585.296 4535.07V4646.16L576.111 4813V4904.23V5008.12L592.87 5167.52L616.627 5351.02L654.573 5505.61L684.39 5663.53L726.688 5794.23L771.301 5910.16L816.831 6006.55L835.105 6056.44L828.491 6176.96L835.105 6266.05L859.662 6375.12L847.853 6427.43L821.205 6509.83L778.267 6679.49L759.907 6878.23L752.589 7026.27L759.907 7235.53L806.771 7416.34L864.495 7652.18L913.098 7792.88L950.35 7962.8L991.666 8111.22L1022.11 8306.38L1030.45 8401.38L1022.11 8447.66L980.22 8514.15L939.437 8572.68L871.525 8646.85L828.491 8696.03L778.267 8707.13L714.078 8731.02L672.559 8776.46L684.39 8815.61H771.301H991.666H1189L1341.34 8811.56L1365.3 8796.73L1374.92 8766.12L1365.3 8715.77L1331.36 8655.28L1310.94 8560.48L1331.36 8465.62L1326.39 8422.47L1310.94 8362.86L1294.57 8253.11L1284.96 8111.22L1278.61 7916.4L1284.96 7722.9L1304.83 7578.52L1317.16 7451.16L1341.34 7354.61L1365.3 7268.86L1374.92 7189.57L1389.45 7026.27V6898.36L1365.3 6769.12L1331.36 6649.38L1294.57 6566.16V6488.14L1317.16 6415.55L1326.39 6299.68V6176.96V6116.32L1294.57 6056.44L1284.96 6000.57L1294.57 5934.22L1317.16 5859.79L1331.36 5806.3L1336.55 5707.95L1341.34 5640.94L1347.04 5501.11L1354.01 5337.66L1360.49 5187.52L1365.3 4972.74V4790.87V4758.16V4732.17L1374.92 4723.76H1394.98";
const FRONT_OUTLINE_RIGHT = "M1685.34 994.066L1673.92 1051.08V1144.74V1238.29L1782.07 1292.48L1876.85 1359.95L1961.45 1431.08L2063.25 1513.07L2258.88 1528.33L2369.03 1554.62L2461.12 1600.42L2536.56 1655.97L2602.22 1740.58L2659.85 1849.36C2659.85 1849.36 2691.35 1910.22 2701.86 1960.81C2712.36 2011.39 2701.86 2051.7 2701.86 2051.7V2185.19L2686.5 2265.89L2659.85 2347.94L2638.79 2416.45L2659.85 2487.22L2686.5 2576.41L2701.86 2670.91L2709.78 2746.24V2886.79V2975.2L2701.86 3053.61L2686.5 3121.96V3170.21L2701.86 3247.19L2743.07 3330.58L2768.18 3409.03L2786.61 3515.18V3635.83L2768.18 3785.68L2743.07 3923.76L2721.36 4041.01L2701.86 4148.5L2686.5 4281.24L2671.03 4380.79L2659.85 4465.46L2652 4539.49V4624.37L2659.85 4675.34L2671.03 4737.74L2686.5 4821.64L2701.86 4879.62L2709.78 4904.23V5016.82L2659.85 5087.53L2584.14 5161.08L2549.23 5212.66H2497.89L2397.96 5198.63L2329.7 5161.08L2313.62 5111.43L2305.91 5078.67L2249.36 5038.41L2233.62 4960.33L2249.36 4888.11L2292.11 4795.47L2329.7 4737.74L2360.39 4675.34L2377.46 4635.65L2385.84 4512.06L2397.96 4380.79L2407.61 4291.53L2397.96 4221.14L2377.46 4141.5L2341.51 4032.97L2305.91 3904.28L2258.88 3785.68L2249.36 3674.5V3570.33V3493.95L2274.82 3378.9L2298.08 3275.38L2305.91 3198.13L2292.11 3104.6L2258.88 3026.68L2233.62 2933.17V2824.63L2225.78 2688.76L2213.83 2588.82V2462.55L2197.08 2347.94L2213.83 2588.82L2192.3 2706.12L2147.85 2832.36L2105.56 2954.92L2075.86 3026.68L2044.47 3088.91V3138.48L2054.39 3224.16L2063.25 3310.83V3426.13L2054.39 3473.02V3550.9L2063.25 3581.09L2086.8 3627.9L2105.56 3710.94V3817.64L2112.94 3904.28L2128.1 4024.18L2157.16 4154.56L2180.26 4275.84L2197.08 4393.17L2204.65 4535.07V4646.16L2213.83 4813V4904.23V5008.12L2197.08 5167.52L2173.31 5351.02L2135.38 5505.61L2105.56 5663.53L2063.25 5794.23L2018.65 5910.16L1973.11 6006.55L1954.84 6056.44L1961.45 6176.96L1954.84 6266.05L1930.28 6375.12L1942.09 6427.43L1968.73 6509.83L2011.67 6679.49L2030.03 6878.23L2037.36 7026.27L2030.03 7235.52L1983.17 7416.34L1925.44 7652.18L1876.85 7792.88L1839.6 7962.8L1798.27 8111.22L1767.83 8306.38L1759.48 8401.38L1767.83 8447.66L1809.72 8514.15L1850.5 8572.68L1918.41 8646.85L1961.45 8696.03L2011.67 8707.12L2075.86 8731.02L2117.39 8776.46L2105.56 8815.61H2018.65H1798.27H1600.94L1448.6 8811.56L1424.64 8796.73L1415.02 8766.12L1424.64 8715.77L1458.58 8655.28L1479.01 8560.48L1458.58 8465.62L1463.56 8422.47L1479.01 8362.86L1495.37 8253.11L1504.99 8111.22L1511.33 7916.4L1504.99 7722.9L1485.12 7578.52L1472.79 7451.16L1448.6 7354.61L1424.64 7268.86L1415.02 7189.57L1400.49 7026.27V6898.36L1424.64 6769.12L1458.58 6649.38L1495.37 6566.16V6488.14L1472.79 6415.55L1463.56 6299.68V6176.96V6116.32L1495.37 6056.44L1504.99 6000.57L1495.37 5934.22L1472.79 5859.79L1458.58 5806.3L1453.4 5707.95L1448.6 5640.94L1442.89 5501.11L1435.93 5337.66L1429.45 5187.52L1424.64 4972.74V4790.87V4758.16V4732.17L1415.02 4723.76H1394.97";

// Seed for consistent random grid
const gridFilled = [
  1,0,1,1,0,1,1,
  1,1,0,1,1,0,1,
  0,1,1,1,0,1,0,
  1,1,1,0,1,1,1,
  1,0,1,1,1,0,1,
  0,1,0,1,1,1,1,
  1,1,1,0,1,1,0,
];

function LabVisual() {
  return (
    <svg width="280" height="260" viewBox="0 0 280 260" fill="none">
      {/* Lab container */}
      <motion.rect
        x="15" y="10" width="250" height="240" rx="14"
        fill="rgba(255,255,255,0.02)"
        stroke="rgba(255,87,168,0.1)"
        strokeWidth="1"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease, delay: 0.2 }}
      />

      {/* Strength trend line - top left */}
      <motion.g
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease, delay: 0.5 }}
      >
        <text x="35" y="35" fill="rgba(255,255,255,0.25)" fontSize="7" fontFamily="Inter" fontWeight="500">FUERZA</text>
        <motion.polyline
          points="35,70 55,65 75,60 95,55 115,48 130,42"
          stroke="rgba(255,87,168,0.4)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease, delay: 0.8 }}
        />
        <motion.path
          d="M35,70 L55,65 L75,60 L95,55 L115,48 L130,42 L130,72 L35,72 Z"
          fill="rgba(255,87,168,0.06)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.8 }}
        />
      </motion.g>

      {/* Volume bars - top right */}
      <motion.g
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease, delay: 0.7 }}
      >
        <text x="155" y="35" fill="rgba(255,255,255,0.25)" fontSize="7" fontFamily="Inter" fontWeight="500">VOLUMEN</text>
        {[
          { x: 160, h: 20 },
          { x: 175, h: 28 },
          { x: 190, h: 24 },
          { x: 205, h: 32 },
          { x: 220, h: 26 },
          { x: 235, h: 35 },
        ].map((bar, i) => (
          <motion.rect
            key={i}
            x={bar.x} y={72 - bar.h} width="10" height={bar.h} rx="2"
            fill="rgba(255,255,255,0.08)"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.5, ease, delay: 1 + i * 0.1 }}
            style={{ transformOrigin: `${bar.x + 5}px 72px` }}
          />
        ))}
      </motion.g>

      {/* Muscle silhouette - bottom left (proper body outline) */}
      <motion.g
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease, delay: 1 }}
      >
        <text x="35" y="95" fill="rgba(255,255,255,0.25)" fontSize="7" fontFamily="Inter" fontWeight="500">MÚSCULOS</text>
        {/* Real front-view body outline from MuscleSilhouetteSVG, scaled to fit */}
        <g transform="translate(28, 95) scale(0.0085)">
          <motion.path
            d={FRONT_OUTLINE_HEAD}
            fill="rgba(255,255,255,0.03)"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="15"
            strokeMiterlimit="10"
            strokeLinejoin="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.3 }}
          />
          <motion.path
            d={FRONT_OUTLINE_LEFT}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="15"
            strokeMiterlimit="10"
            strokeLinejoin="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.3 }}
          />
          <motion.path
            d={FRONT_OUTLINE_RIGHT}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="15"
            strokeMiterlimit="10"
            strokeLinejoin="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.3 }}
          />
          {/* Chest highlight */}
          <motion.ellipse
            cx="1395" cy="1650" rx="250" ry="180"
            fill="rgba(255,87,168,0.3)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0.4] }}
            transition={{ duration: 1.5, delay: 1.8 }}
          />
          {/* Shoulder highlights */}
          <motion.ellipse
            cx="1050" cy="1350" rx="120" ry="160"
            fill="rgba(255,87,168,0.2)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0.3] }}
            transition={{ duration: 1.5, delay: 1.9 }}
          />
          <motion.ellipse
            cx="1740" cy="1350" rx="120" ry="160"
            fill="rgba(255,87,168,0.2)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0.3] }}
            transition={{ duration: 1.5, delay: 1.9 }}
          />
          {/* Quad highlights */}
          <motion.ellipse
            cx="1200" cy="5500" rx="180" ry="500"
            fill="rgba(255,87,168,0.18)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0.25] }}
            transition={{ duration: 1.5, delay: 2.1 }}
          />
          <motion.ellipse
            cx="1590" cy="5500" rx="180" ry="500"
            fill="rgba(255,87,168,0.18)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0.25] }}
            transition={{ duration: 1.5, delay: 2.1 }}
          />
        </g>
      </motion.g>

      {/* Consistency grid - center right */}
      <motion.g
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease, delay: 1.2 }}
      >
        <text x="135" y="95" fill="rgba(255,255,255,0.25)" fontSize="7" fontFamily="Inter" fontWeight="500">CONSISTENCIA</text>
        {Array.from({ length: 7 }).map((_, row) =>
          Array.from({ length: 7 }).map((_, col) => {
            const idx = row * 7 + col;
            const filled = gridFilled[idx];
            return (
              <motion.rect
                key={`${row}-${col}`}
                x={135 + col * 12}
                y={103 + row * 12}
                width="9" height="9" rx="2"
                fill={filled ? 'rgba(255,87,168,0.2)' : 'rgba(255,255,255,0.03)'}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: 1.5 + idx * 0.02 }}
              />
            );
          })
        )}
      </motion.g>

      {/* Nutrition adherence - bottom left */}
      <motion.g
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease, delay: 1.5 }}
      >
        <text x="35" y="210" fill="rgba(255,255,255,0.25)" fontSize="7" fontFamily="Inter" fontWeight="500">NUTRICIÓN</text>
        <rect x="35" y="217" width="80" height="5" rx="2.5" fill="rgba(255,255,255,0.04)" />
        <motion.rect
          x="35" y="217" width="62" height="5" rx="2.5"
          fill="rgba(255,87,168,0.25)"
          initial={{ width: 0 }}
          animate={{ width: 62 }}
          transition={{ duration: 0.8, ease, delay: 1.8 }}
        />
        <rect x="35" y="227" width="80" height="5" rx="2.5" fill="rgba(255,255,255,0.04)" />
        <motion.rect
          x="35" y="227" width="70" height="5" rx="2.5"
          fill="rgba(255,255,255,0.12)"
          initial={{ width: 0 }}
          animate={{ width: 70 }}
          transition={{ duration: 0.8, ease, delay: 2 }}
        />
        <rect x="35" y="237" width="80" height="5" rx="2.5" fill="rgba(255,255,255,0.04)" />
        <motion.rect
          x="35" y="237" width="50" height="5" rx="2.5"
          fill="rgba(255,255,255,0.08)"
          initial={{ width: 0 }}
          animate={{ width: 50 }}
          transition={{ duration: 0.8, ease, delay: 2.2 }}
        />
      </motion.g>

      {/* Weight trend - bottom right (below consistency) */}
      <motion.g
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease, delay: 1.7 }}
      >
        <text x="135" y="210" fill="rgba(255,255,255,0.25)" fontSize="7" fontFamily="Inter" fontWeight="500">PESO</text>
        <motion.polyline
          points="135,240 150,238 165,235 180,233 195,230 210,227 225,224 240,220"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease, delay: 2 }}
        />
        <motion.circle
          cx="240" cy="220" r="3"
          fill="rgba(255,87,168,0.4)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 2.8 }}
        />
      </motion.g>

      {/* Subtle overall glow */}
      <motion.rect
        x="15" y="10" width="250" height="240" rx="14"
        fill="none"
        stroke="rgba(255,87,168,0.08)"
        strokeWidth="2"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.4, 0] }}
        transition={{ duration: 3, repeat: Infinity, delay: 3, ease: 'easeInOut' }}
      />
    </svg>
  );
}

export default function Card06Lab() {
  return (
    <ScreenWrapper>
      <Visual>
        <LabVisual />
      </Visual>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.5 }}
      >
        <Title>El <Bold>Lab</Bold> es tu <Bold>tablero de rendimiento</Bold></Title>
      </motion.div>
    </ScreenWrapper>
  );
}
