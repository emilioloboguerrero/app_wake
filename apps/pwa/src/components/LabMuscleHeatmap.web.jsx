import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Asset } from 'expo-asset';

const svgModule = require('../assets/icons/vectors_fig/porfin.svg');

const MUSCLE_KEYS = [
  'pecs', 'triceps', 'front_delts', 'lats', 'rhomboids', 'biceps', 'rear_delts',
  'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'obliques', 'lower_back',
  'hip_flexors', 'side_delts', 'traps',
];

function getFetchableSvgUrl(moduleOrUrl) {
  if (typeof moduleOrUrl === 'string' && (moduleOrUrl.startsWith('http') || moduleOrUrl.startsWith('/'))) {
    return moduleOrUrl;
  }
  const asset = Asset.fromModule(moduleOrUrl);
  return asset.uri;
}

// White → gold → red scale matching muscleColorUtils.js
function getVolumeStyle(sets) {
  const n = sets || 0;
  if (n === 0) return { fill: 'rgba(255,255,255,0.09)', stroke: 'rgba(255,255,255,0.12)' };
  if (n <= 5) {
    const alpha = (0.35 + (n / 5) * 0.35).toFixed(2);
    return { fill: `rgba(255,255,255,${alpha})`, stroke: 'rgba(255,255,255,0.3)' };
  }
  if (n <= 15) {
    const alpha = (0.58 + ((n - 5) / 10) * 0.28).toFixed(2);
    return { fill: `rgba(191,168,77,${alpha})`, stroke: 'rgba(191,168,77,0.48)' };
  }
  return { fill: 'rgba(139,0,0,0.85)', stroke: 'rgba(139,0,0,0.55)' };
}

// Gold (low opacity) = increased, white = similar, red = decreased vs previous week
function getTrendStyle(current, previous) {
  const cur = current || 0;
  const prev = previous || 0;
  if (cur === 0 && prev === 0) return { fill: 'rgba(255,255,255,0.09)', stroke: 'rgba(255,255,255,0.12)' };
  if (prev === 0) return { fill: 'rgba(191,168,77,0.32)', stroke: 'rgba(191,168,77,0.26)' };
  if (cur === 0) return { fill: 'rgba(139,0,0,0.75)', stroke: 'rgba(139,0,0,0.5)' };
  const pct = (cur - prev) / prev;
  if (pct > 0.1) return { fill: 'rgba(191,168,77,0.35)', stroke: 'rgba(191,168,77,0.28)' };
  if (pct > -0.1) return { fill: 'rgba(255,255,255,0.52)', stroke: 'rgba(255,255,255,0.32)' };
  return { fill: 'rgba(139,0,0,0.78)', stroke: 'rgba(139,0,0,0.5)' };
}

const VOLUME_LEGEND = [
  { color: 'rgba(255,255,255,0.55)', label: 'Poca carga' },
  { color: 'rgba(191,168,77,0.78)', label: 'Carga media' },
  { color: 'rgba(139,0,0,0.85)', label: 'Alta carga' },
  { color: 'rgba(255,255,255,0.09)', label: 'Sin datos' },
];

const TENDENCIA_LEGEND = [
  { color: 'rgba(191,168,77,0.35)', label: 'Aumentó' },
  { color: 'rgba(255,255,255,0.52)', label: 'Similar' },
  { color: 'rgba(139,0,0,0.78)', label: 'Bajó' },
  { color: 'rgba(255,255,255,0.09)', label: 'Sin datos' },
];

export default function LabMuscleHeatmap({ weekVolume = {}, previousWeekVolume = {} }) {
  const [rawSvg, setRawSvg] = useState('');
  const [fetchFailed, setFetchFailed] = useState(false);
  const [viewMode, setViewMode] = useState('volume');

  const LAB_HEATMAP_SVG_ID = 'lab-muscle-heatmap-svg';
  const scope = `#${LAB_HEATMAP_SVG_ID}`;

  const muscleStyle = useMemo(() => {
    const base = `
      ${scope} { background: transparent; }
      ${scope} path { stroke: rgba(255,255,255,0.14) !important; fill: rgba(255,255,255,0.06) !important; }
      ${scope} #muscles path { fill: rgba(255,255,255,0.09) !important; stroke: rgba(255,255,255,0.12) !important; }
      ${scope} #outlines path { fill: none !important; stroke: rgba(255,255,255,0.8) !important; }
    `;
    const fills = MUSCLE_KEYS.map((id) => {
      const s = viewMode === 'tendencia'
        ? getTrendStyle(weekVolume[id], previousWeekVolume[id])
        : getVolumeStyle(weekVolume[id]);
      return `${scope} #${id} path { fill: ${s.fill} !important; stroke: ${s.stroke} !important; }`;
    }).join('\n');
    return base + fills;
  }, [weekVolume, previousWeekVolume, viewMode]);

  const styledSvg = useMemo(() => {
    if (!rawSvg) return '';
    const withId = rawSvg.startsWith('<svg') ? rawSvg.replace('<svg', `<svg id="${LAB_HEATMAP_SVG_ID}"`) : rawSvg;
    return withId.replace('</svg>', `<style>${muscleStyle}</style></svg>`);
  }, [rawSvg, muscleStyle]);

  useEffect(() => {
    const loadSvg = async () => {
      try {
        const url = getFetchableSvgUrl(svgModule);
        if (!url) { setFetchFailed(true); return; }
        const res = await fetch(url);
        if (!res.ok) { setFetchFailed(true); return; }
        const text = await res.text();
        const sized = text
          .replace(/width="7996"/, 'width="100%"')
          .replace(/height="8819"/, 'style="height:auto;display:block;"');
        setRawSvg(sized);
      } catch {
        setFetchFailed(true);
      }
    };
    loadSvg();
  }, []);

  if (fetchFailed) return (
    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginVertical: 8 }}>
      No se pudo cargar el diagrama muscular.
    </Text>
  );
  if (!styledSvg) return null;

  const legend = viewMode === 'tendencia' ? TENDENCIA_LEGEND : VOLUME_LEGEND;

  return (
    <View style={styles.wrap}>
      <View style={styles.toggleRow}>
        {[
          { key: 'volume', label: 'Esta semana' },
          { key: 'tendencia', label: 'Tendencia' },
        ].map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.toggleBtn, viewMode === key && styles.toggleBtnActive]}
            onPress={() => setViewMode(key)}
          >
            <Text style={[styles.toggleText, viewMode === key && styles.toggleTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <div
        style={{ width: '100%', lineHeight: 0 }}
        dangerouslySetInnerHTML={{ __html: styledSvg }}
      />
      <View style={styles.legend}>
        {legend.map(({ color, label }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  toggleText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  toggleTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
});
