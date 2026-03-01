import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  TextInput,
  useWindowDimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import { FixedWakeHeader, WakeHeaderContent } from '../components/WakeHeader';
import { isPWA } from '../utils/platform';
import WeekDateSelector from '../components/WeekDateSelector.web';
import BottomSpacer from '../components/BottomSpacer';
import WakeModalOverlay from '../components/WakeModalOverlay.web';
import * as nutritionDb from '../services/nutritionFirestoreService';
import * as nutritionApi from '../services/nutritionApiService';
import activityStreakService from '../services/activityStreakService';
import logger from '../utils/logger';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import SvgFire from '../components/icons/vectors_fig/Environment/Fire';
import Steak from '../components/icons/Steak';
import Wheat from '../components/icons/Wheat';
import Avocado from '../components/icons/Avocado';
import SvgChevronDown from '../components/icons/vectors_fig/Arrow/ChevronDown';
import SvgBarcodeFile from '../components/icons/vectors_fig/System/BarcodeFile';
import WakeLoader from '../components/WakeLoader';
import { Video, ResizeMode } from 'expo-av';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';

const GOLD = 'rgba(191, 168, 77, 1)';
const ICON_WHITE = 'rgba(255,255,255,0.95)';
const REMAINING_GRAY = 'rgba(255, 255, 255, 0.12)';
const GOLD_FILL = 'rgba(255, 255, 255, 0.75)';
const OVER_LIMIT_RED = 'rgba(255, 68, 68, 0.3)';

const NUTRITION_SPACER_SAFE_TOP_FALLBACK = 59;
const NUTRITION_SPACER_MIN_TOP = 40;

function NutritionTopSpacer() {
  const insets = useSafeAreaInsets();
  const ref = React.useRef(null);
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  const rawTop = Math.max(0, Number(insets?.top) || 0);
  const useMinForRealDevice = Platform.OS === 'web' && (isIOS || isPWA());
  // 59px fallback only on iOS or PWA (standalone) so iPhone PWA layout is correct; desktop/Android use 0 when rawTop is 0.
  const effectiveTop =
    rawTop === 0
      ? (isIOS || isPWA() ? NUTRITION_SPACER_SAFE_TOP_FALLBACK : 0)
      : useMinForRealDevice && rawTop < NUTRITION_SPACER_MIN_TOP
        ? NUTRITION_SPACER_SAFE_TOP_FALLBACK
        : rawTop;
  const headerHeight = 32 + effectiveTop;
  const extra = isIOS ? 0 : 100;
  const computedHeight = headerHeight + extra;
  if (ref.current === null || computedHeight > ref.current) {
    ref.current = computedHeight;
  }
  const totalHeight = Number.isFinite(ref.current) ? ref.current : 32 + (isIOS || isPWA() ? NUTRITION_SPACER_SAFE_TOP_FALLBACK : 0);
  return <div style={{ height: totalHeight, flexShrink: 0, boxSizing: 'border-box' }} />;
}

const DROP_STAGGER_MS = 70;
const DROP_DURATION = 240;
const DROP_OFFSET = -14;
const MAX_DROP_CHARS = 16;

function DroppedNumber({ value, suffix = '', trailing, valueStyle, containerStyle }) {
  const mainStr = String(value ?? '') + suffix;
  const trailingStr = trailing?.text ?? '';
  const s = mainStr + trailingStr;
  const chars = s.split('').slice(0, MAX_DROP_CHARS);
  const mainLen = mainStr.length;
  const trailingStyle = trailing?.style;
  const animRef = useRef(null);
  if (!animRef.current) {
    animRef.current = Array.from({ length: MAX_DROP_CHARS }, () => ({
      translateY: new Animated.Value(DROP_OFFSET),
      opacity: new Animated.Value(0),
    }));
  }
  const anims = animRef.current;

  useEffect(() => {
    if (chars.length === 0) return;
    chars.forEach((_, i) => {
      anims[i].translateY.setValue(DROP_OFFSET);
      anims[i].opacity.setValue(0);
    });
    const animations = chars.map((_, i) =>
      Animated.parallel([
        Animated.timing(anims[i].translateY, {
          toValue: 0,
          duration: DROP_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(anims[i].opacity, {
          toValue: 1,
          duration: DROP_DURATION,
          useNativeDriver: true,
        }),
      ])
    );
    Animated.stagger(DROP_STAGGER_MS, animations).start();
  }, [s]);

  if (chars.length === 0) return null;
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'flex-end' }, containerStyle]}>
      {chars.map((char, i) => (
        <Animated.View
          key={i}
          style={{
            opacity: anims[i].opacity,
            transform: [{ translateY: anims[i].translateY }],
            flexShrink: 0,
          }}
        >
          <Text style={i < mainLen ? valueStyle : (trailingStyle || valueStyle)}>{char}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

function sumDiary(diaryEntries) {
  let calories = 0, protein = 0, carbs = 0, fat = 0;
  (diaryEntries || []).forEach((e) => {
    calories += Number(e.calories) || 0;
    protein += Number(e.protein) || 0;
    carbs += Number(e.carbs) || 0;
    fat += Number(e.fat) || 0;
  });
  return { calories, protein, carbs, fat };
}

function optionMacros(option) {
  const items = option.items ?? option.foods ?? [];
  if (items.length > 0) {
    return items.reduce(
      (acc, it) => ({
        calories: acc.calories + (Number(it.calories) || 0),
        protein: acc.protein + (Number(it.protein) || Number(it.protein_g) || 0),
        carbs: acc.carbs + (Number(it.carbs) || Number(it.carbs_g) || 0),
        fat: acc.fat + (Number(it.fat) || Number(it.fat_g) || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }
  return {
    calories: Number(option.calories) || 0,
    protein: Number(option.protein_g) || Number(option.protein) || 0,
    carbs: Number(option.carbs_g) || Number(option.carbs) || 0,
    fat: Number(option.fat_g) || Number(option.fat) || 0,
  };
}

const UNIT_PLURALS = {
  cup: 'cups', cups: 'cups', taza: 'tazas', tazas: 'tazas',
  tablespoon: 'tablespoons', tablespoons: 'tablespoons', cucharada: 'cucharadas', cucharadas: 'cucharadas',
  teaspoon: 'teaspoons', teaspoons: 'teaspoons', cucharadita: 'cucharaditas', cucharaditas: 'cucharaditas',
  slice: 'slices', slices: 'slices', rebanada: 'rebanadas', rebanadas: 'rebanadas',
  serving: 'servings', servings: 'servings', porción: 'porciones', porciones: 'porciones', porcion: 'porciones',
  portion: 'portions', portions: 'portions', piece: 'pieces', pieces: 'pieces', unidad: 'unidades', unidades: 'unidades',
  small: 'small', medium: 'medium', large: 'large', 'extra large': 'extra large', 'extra-large': 'extra-large',
};

function pluralizeUnit(word) {
  const w = (word || '').trim().toLowerCase();
  if (UNIT_PLURALS[w]) return UNIT_PLURALS[w];
  if (w.endsWith('s')) return w;
  return w + 's';
}

function parseGramsOrMlFromUnit(unitLabel) {
  const u = (unitLabel ?? '').trim();
  const m = u.match(/^(\d+(?:[.,]\d+)?)\s*(g|gram|gramos?|ml)\s*$/i);
  if (m) return { amount: Number(m[1].replace(',', '.')), isMl: /ml/i.test(m[2]) };
  if (/^1\s*(g|ml)\s*$/i.test(u)) return { amount: 1, isMl: /ml/i.test(u) };
  return null;
}

function getGramsPerUnitFromServings(servings, servingId) {
  if (!Array.isArray(servings) || servings.length === 0 || servingId == null) return null;
  const hundred = servings.find((s) => /100\s*g|100g/i.test(String(s.serving_description || '')));
  let caloriesPer100g;
  if (hundred) {
    caloriesPer100g = Number(hundred.calories) || 0;
  } else {
    const first = servings[0];
    const grams = Number(first.metric_serving_amount) || 100;
    const scale = 100 / grams;
    caloriesPer100g = (Number(first.calories) || 0) * scale;
  }
  if (caloriesPer100g <= 0) return null;
  const selected = servings.find((s) => String(s.serving_id) === String(servingId));
  if (!selected) return null;
  const caloriesPerUnit = Number(selected.calories) || 0;
  return (caloriesPerUnit * 100) / caloriesPer100g;
}

function formatQuantityAndServing(numUnits, unitLabel, gramsPerUnit) {
  const n = Number(numUnits) || 1;
  const displayN = Number.isInteger(n) ? String(n) : n.toFixed(1);
  const unit = (unitLabel ?? '').trim();
  let effectiveGpu = gramsPerUnit != null ? Number(gramsPerUnit) : null;
  if (effectiveGpu == null && unit) {
    const parsed = parseGramsOrMlFromUnit(unit);
    if (parsed) effectiveGpu = parsed.amount;
  }
  const totalG = effectiveGpu != null ? Math.round(n * effectiveGpu) : null;
  const gramOrMlAtEnd = /(\d+\s*)?(g|gram|gramos?|ml)\s*$/i.test(unit);
  const isMl = /(\d+\s*)?ml\s*$/i.test(unit);
  if (gramOrMlAtEnd && totalG != null) {
    return { main: `${totalG} ${isMl ? 'ml' : 'g'}`, sub: null };
  }
  const numStartMatch = unit.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (numStartMatch) {
    const embeddedCount = Number(numStartMatch[1].replace(',', '.')) || 1;
    const label = numStartMatch[2].trim();
    const totalCount = Math.round(n * embeddedCount);
    const displayCount = Number.isInteger(totalCount) ? String(totalCount) : totalCount.toFixed(1);
    const displayLabel = totalCount === 1 ? label : pluralizeUnit(label);
    return { main: `${displayCount} ${displayLabel}`, sub: totalG != null ? `(${totalG} g)` : null };
  }
  if (unit && totalG != null) return { main: `${displayN} ${unit}`, sub: `(${totalG} g)` };
  if (unit) return { main: `${displayN} ${unit}`, sub: null };
  return { main: `× ${displayN}`, sub: null };
}

function formatIngredientRight(it) {
  const amount = it.amount ?? it.quantity ?? it.number_of_units;
  const numUnits = Number(amount) || 1;
  let gramsPerUnit = it.grams_per_unit != null ? Number(it.grams_per_unit) : (it.serving_weight_grams != null ? Number(it.serving_weight_grams) : null);
  if ((gramsPerUnit == null || gramsPerUnit === 1) && Array.isArray(it.servings) && it.serving_id != null) {
    const computed = getGramsPerUnitFromServings(it.servings, it.serving_id);
    if (computed != null) gramsPerUnit = computed;
  }
  let unitLabel = (it.unit ?? it.serving_unit ?? it.unit_name ?? it.serving_description ?? '').trim();
  const unitLooksLikeDerived1g = /^1\s*g$/i.test(unitLabel);
  if ((!unitLabel || unitLooksLikeDerived1g) && Array.isArray(it.servings) && it.serving_id != null) {
    const s = it.servings.find((ss) => String(ss.serving_id) === String(it.serving_id));
    if (s?.serving_description && !/^1\s*g$/i.test(s.serving_description)) {
      unitLabel = String(s.serving_description).trim();
    }
  }
  if (unitLabel || gramsPerUnit != null) return formatQuantityAndServing(numUnits, unitLabel || (gramsPerUnit != null ? 'g' : ''), gramsPerUnit);
  if (amount != null && amount !== '') return { main: String(amount), sub: null };
  return { main: '—', sub: null };
}

function formatDiaryServing(entry) {
  const units = Number(entry.number_of_units) || 1;
  let unit = (entry.serving_unit ?? entry.serving_description ?? '').trim();
  const unitLooksLikeDerived1g = /^1\s*g$/i.test(unit);
  if ((!unit || unitLooksLikeDerived1g) && Array.isArray(entry.servings) && entry.serving_id != null) {
    const s = entry.servings.find((ss) => String(ss.serving_id) === String(entry.serving_id));
    if (s?.serving_description && !/^1\s*g$/i.test(s.serving_description)) {
      unit = String(s.serving_description).trim();
    }
  }
  let gramsPerUnit = entry.grams_per_unit != null ? Number(entry.grams_per_unit) : null;
  if ((gramsPerUnit == null || gramsPerUnit === 1) && Array.isArray(entry.servings) && entry.serving_id != null) {
    const computed = getGramsPerUnitFromServings(entry.servings, entry.serving_id);
    if (computed != null) gramsPerUnit = computed;
  }
  return formatQuantityAndServing(units, unit || (gramsPerUnit != null ? 'g' : ''), gramsPerUnit);
}

// Unified pattern list — matches FatSecret sub-category strings (English) AND food names (Spanish/English).
// Order matters: more specific patterns first to avoid false positives.
const EMOJI_PATTERNS = [
  // Eggs — before dairy so "egg" doesn't fall through to milk
  [/egg|huevo/i, '🥚'],
  // Shellfish — before generic fish
  [/shrimp|prawn|lobster|crab|scallop|mussel|clam|oyster|squid|octopus|camar[oó]n|langostino|cangrejo|pulpo|calamar/i, '🦐'],
  // Fish
  [/\bfish\b|salmon|tuna|cod|tilapia|sardine|anchovy|trout|bass|halibut|mahi|swordfish|catfish|herring|mackerel|snapper|atún|salmón|tilapia|sardina|trucha|bacalao|dorado|corvina|mojarra/i, '🐟'],
  // Poultry — specific cuts first
  [/chicken\s*breast|pechuga/i, '🍗'],
  [/chicken|poultry|turkey|duck|hen|gallina|muslo|alita/i, '🍗'],
  // Processed meats — before generic beef/pork
  [/sausage|hot\s*dog|frankfurter|chorizo|salchicha/i, '🌭'],
  [/bacon|tocino/i, '🥩'],
  // Red meat
  [/steak|sirloin|ribeye|tenderloin|filet|lomo|bistec/i, '🥩'],
  [/\bbeef\b|bison|veal|res|carne\s*(de\s*res)?|costilla|ternera/i, '🥩'],
  [/\bpork\b|cerdo|ham|jamón|prosciutto/i, '🥩'],
  [/lamb|mutton|cordero/i, '🥩'],
  // Dairy — specific before generic
  [/cheese|queso/i, '🧀'],
  [/butter|margarine|mantequilla/i, '🧈'],
  [/yogurt|yoghurt|yogur/i, '🥛'],
  [/\bmilk\b|leche(?!\s*en\s*polvo)/i, '🥛'],
  // Grains — rice cakes before plain rice
  [/rice\s*cake|puffed\s*rice|galleta\s*de\s*arroz/i, '🍚'],
  [/\brice\b|arroz/i, '🍚'],
  [/pasta|spaghetti|noodle|macaroni|penne|fusilli|lasagna|espagueti|macarrón|fideos/i, '🍝'],
  [/\bbread\b|baguette|pita|flatbread|arepa|empanada|pan\b/i, '🍞'],
  [/\btortilla\b/i, '🍞'],
  [/oat|granola|cereal|avena/i, '🥣'],
  // Vegetables — sweet potato before plain potato
  [/sweet\s*potato|yam|camote/i, '🍠'],
  [/\bpotato\b|papa\b|patata/i, '🥔'],
  [/\byuca\b|cassava/i, '🥔'],
  [/avocado|aguacate|palta/i, '🥑'],
  [/broccoli|br[oó]coli/i, '🥦'],
  [/spinach|kale|chard|arugula|collard|espinaca|lechuga|berro/i, '🥬'],
  [/\blettuce\b/i, '🥬'],
  [/carrot|zanahoria/i, '🥕'],
  [/tomato|tomate/i, '🍅'],
  [/cucumber|pepino/i, '🥒'],
  [/bell\s*pepper|capsicum|piment[oó]n|pimiento/i, '🫑'],
  [/\bonion\b|cebolla/i, '🧅'],
  [/\bgarlic\b|ajo/i, '🧄'],
  [/\bcorn\b|maize|ma[ií]z/i, '🌽'],
  [/mushroom|champ[iñ]+[oó]n|hongo/i, '🍄'],
  // Fruits — specific before generic
  [/strawberry|raspberry|blueberry|blackberry|fresa/i, '🍓'],
  [/\bgrape\b|uva/i, '🍇'],
  [/lemon|lime|lim[oó]n|lima/i, '🍋'],
  [/watermelon|sand[ií]a/i, '🍉'],
  [/pineapple|pi[ñn]a/i, '🍍'],
  [/peach|nectarine|durazno|melocot[oó]n/i, '🍑'],
  [/\bcherry\b|cereza/i, '🍒'],
  [/\bpear\b|pera/i, '🍐'],
  [/\bmango\b/i, '🥭'],
  [/banana|pl[aá]tano|banano/i, '🍌'],
  [/orange|mandarin|tangerine|clementine|naranja|mandarina/i, '🍊'],
  [/\bapple[s]?\b|manzana/i, '🍎'],
  // Legumes
  [/chickpea|garbanzo/i, '🫘'],
  [/lentil|lenteja/i, '🫘'],
  [/\bbean[s]?\b|frijol|arveja/i, '🫘'],
  [/\bsoy\b|tofu|soya/i, '🫘'],
  // Nuts & seeds
  [/almond|almendra/i, '🥜'],
  [/peanut|man[ií]|cacahuate/i, '🥜'],
  [/walnut|cashew|pistachio|pecan|hazelnut|nuez/i, '🥜'],
  [/\bseed\b|semilla|ch[ií]a|linaza|s[eé]samo/i, '🌱'],
  // Fats & oils
  [/olive\s*oil|aceite\s*de\s*oliva/i, '🫒'],
  [/\boil\b|aceite/i, '🫒'],
  // Supplements
  [/protein\s*powder|whey|casein|supplement|prote[íi]na\s*en\s*polvo|prote[íi]na\s*de\s*suero|leche\s*en\s*polvo/i, '💪'],
  // Beverages
  [/\bwater\b|agua/i, '💧'],
  [/juice|smoothie|jugo|zumo/i, '🍹'],
  [/coffee|espresso|caf[eé]/i, '☕'],
  [/\btea\b|t[eé]\b/i, '🍵'],
  // Snacks
  [/chip[s]?|crisp[s]?|cracker|pretzel|popcorn|snack/i, '🥨'],
  // Sweets
  [/chocolate|candy|sweet|dessert|caramel|sugar|az[uú]car/i, '🍬'],
  // Prepared meals
  [/soup|stew|broth|caldo/i, '🍲'],
  [/\bpizza\b/i, '🍕'],
  [/burger|sandwich/i, '🍔'],
  [/salad|ensalada/i, '🥗'],
  // Generic catch-alls last
  [/\bfruit[s]?\b|fruta/i, '🍎'],
  [/vegetable[s]?|veggie|verdura/i, '🥦'],
];

const FOOD_EMOJIS = [...new Set(EMOJI_PATTERNS.map(([, e]) => e))];

function getRandomFoodEmojis(count = 5) {
  const shuffled = [...FOOD_EMOJIS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, FOOD_EMOJIS.length));
}

function getFoodEmoji(it) {
  const cat = it.food_category ?? '';
  if (cat) {
    for (const [pattern, emoji] of EMOJI_PATTERNS) {
      if (pattern.test(cat)) return emoji;
    }
  }
  const name = it.name ?? '';
  for (const [pattern, emoji] of EMOJI_PATTERNS) {
    if (pattern.test(name)) return emoji;
  }
  return '🍽️';
}

const MAX_MEAL_EMOJIS = 6;

function getMealEmojis(items) {
  const sorted = [...items].sort((a, b) => (Number(b.calories) || 0) - (Number(a.calories) || 0));
  const emojis = [];
  for (const item of sorted) {
    const emoji = getFoodEmoji(item);
    if (!emojis.includes(emoji)) emojis.push(emoji);
    if (emojis.length === MAX_MEAL_EMOJIS) break;
  }
  return emojis;
}

const MEAL_BANNER_COLORS = [
  '#3f2a1f',
  '#1e3220',
  '#1e1e3f',
  '#321e32',
  '#142a32',
  '#322814',
  '#261414',
  '#14261e',
  '#2a2a14',
  '#141e28',
];

const BANNER_LAYOUT = [
  { xPct: 5,   yPct: 14, size: 42 },
  { xPct: 35,  yPct: 14, size: 42 },
  { xPct: 65,  yPct: 14, size: 42 },
  { xPct: 95,  yPct: 14, size: 42 },
  { xPct: 20,   yPct: 50, size: 26 },
  { xPct: 50,   yPct: 50, size: 26 },
  { xPct: 80,   yPct: 50, size: 26 },
  { xPct: 5,   yPct: 86, size: 42 },
  { xPct: 35,  yPct: 86, size: 42 },
  { xPct: 65,  yPct: 86, size: 42 },
  { xPct: 95,  yPct: 86, size: 42 },
];

// Row 1 and row 3: same subset — only first 2 emojis (0,1). Row 2: only the rest (2,3,…) when n>=3 so it’s not the same as 1&3.
function getBannerEmojiOrder(n) {
  if (n <= 0) return [];
  const r1 = (a, b, c, d) => [a, b, c, d];
  const r2 = (a, b, c) => [a, b, c];
  if (n === 1) return [...r1(0, 0, 0, 0), ...r2(0, 0, 0), ...r1(0, 0, 0, 0)];
  if (n === 2) return [...r1(0, 1, 0, 1), ...r2(0, 1, 0), ...r1(0, 1, 0, 1)];
  if (n === 3) return [...r1(0, 1, 0, 1), ...r2(2, 2, 2), ...r1(0, 1, 0, 1)];
  if (n === 4) return [...r1(0, 1, 0, 1), ...r2(2, 3, 2), ...r1(0, 1, 0, 1)];
  if (n === 5) return [...r1(0, 1, 0, 1), ...r2(3, 4, 3), ...r1(0, 1, 0, 1)];
  return [...r1(0, 1, 0, 1), ...r2(3, 4, 5), ...r1(0, 1, 0, 1)];
}

function MealImageBanner({ items, colorIndex, categoryIndex = 0 }) {
  const emojis = getMealEmojis(items);
  const colorIdx = (categoryIndex * 31 + colorIndex * 7 + 13) % MEAL_BANNER_COLORS.length;
  const bg = MEAL_BANNER_COLORS[colorIdx];
  if (emojis.length === 0) {
    return <View style={[styles.mealBanner, { backgroundColor: bg }]} />;
  }
  const order = getBannerEmojiOrder(emojis.length);
  return (
    <View style={[styles.mealBanner, { backgroundColor: bg }]}>
      {BANNER_LAYOUT.map((pos, i) => (
        <Text
          key={i}
          selectable={false}
          style={[
            styles.mealBannerEmoji,
            {
              left: `${pos.xPct}%`,
              top: `${pos.yPct}%`,
              fontSize: pos.size,
              lineHeight: pos.size + 4,
            },
          ]}
        >
          {emojis[order[i] % emojis.length]}
        </Text>
      ))}
    </View>
  );
}

const NO_OPCIONES_EMOJI_LAYOUT = [
  { xPct: 5, yPct: 6, size: 36 },
  { xPct: 35, yPct: 6, size: 36 },
  { xPct: 65, yPct: 6, size: 36 },
  { xPct: 95, yPct: 6, size: 36 },
  { xPct: 20, yPct: 20, size: 28 },
  { xPct: 50, yPct: 20, size: 28 },
  { xPct: 80, yPct: 20, size: 28 },
  { xPct: 5, yPct: 34, size: 36 },
  { xPct: 35, yPct: 34, size: 36 },
  { xPct: 65, yPct: 34, size: 36 },
  { xPct: 95, yPct: 34, size: 36 },
  { xPct: 20, yPct: 48, size: 28 },
  { xPct: 50, yPct: 48, size: 28 },
  { xPct: 80, yPct: 48, size: 28 },
  { xPct: 5, yPct: 62, size: 36 },
  { xPct: 35, yPct: 62, size: 36 },
  { xPct: 65, yPct: 62, size: 36 },
  { xPct: 95, yPct: 62, size: 36 },
  { xPct: 20, yPct: 76, size: 28 },
  { xPct: 50, yPct: 76, size: 28 },
  { xPct: 80, yPct: 76, size: 28 },
  { xPct: 5, yPct: 90, size: 36 },
  { xPct: 35, yPct: 90, size: 36 },
  { xPct: 65, yPct: 90, size: 36 },
  { xPct: 95, yPct: 90, size: 36 },
  { xPct: 20, yPct: 96, size: 28 },
  { xPct: 50, yPct: 96, size: 28 },
  { xPct: 80, yPct: 96, size: 28 },
];

function NoOpcionesEmptyCard() {
  const emojis = useMemo(() => getRandomFoodEmojis(20), []);
  const colorIdx = 2;
  const bg = MEAL_BANNER_COLORS[colorIdx];
  return (
    <View style={[styles.opcionesCard, styles.noOpcionesEmptyRoot, styles.noOpcionesFillParent]}>
      <View style={[StyleSheet.absoluteFillObject, styles.noOpcionesEmojiBg, { backgroundColor: bg }]}>
        {NO_OPCIONES_EMOJI_LAYOUT.map((pos, i) => (
          <Text
            key={i}
            selectable={false}
            style={[
              styles.mealBannerEmoji,
              styles.noOpcionesEmojiCell,
              {
                left: `${pos.xPct}%`,
                top: `${pos.yPct}%`,
                fontSize: pos.size,
                lineHeight: pos.size + 4,
              },
            ]}
          >
            {emojis[i % emojis.length]}
          </Text>
        ))}
      </View>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.noOpcionesOverlay} />
      </View>
      <View style={styles.noOpcionesGlassWrap}>
        <View style={[styles.noOpcionesGlassCard, styles.noOpcionesGlassCardWeb]}>
          <View style={styles.noOpcionesGlassCardInner}>
            <Text style={styles.noOpcionesGlassText}>No tienes opciones planificadas para esta comida.</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function getPer100g(food) {
  const servings = food?.servings?.serving;
  if (!Array.isArray(servings) || servings.length === 0) return null;
  const hundred = servings.find((s) => /100\s*g|100g/i.test(String(s.serving_description || '')));
  if (hundred) {
    return {
      calories: Number(hundred.calories) || 0,
      protein: Number(hundred.protein) || 0,
      carbs: Number(hundred.carbohydrate) || 0,
      fat: Number(hundred.fat) || 0,
    };
  }
  const first = servings[0];
  const grams = Number(first.metric_serving_amount) || 100;
  const scale = 100 / grams;
  return {
    calories: Math.round((Number(first.calories) || 0) * scale),
    protein: Math.round((Number(first.protein) || 0) * scale * 10) / 10,
    carbs: Math.round((Number(first.carbohydrate) || 0) * scale * 10) / 10,
    fat: Math.round((Number(first.fat) || 0) * scale * 10) / 10,
  };
}

function isGramOnlyServing(s) {
  const d = String(s.serving_description || '').trim();
  return /^\d+([.,]\d+)?\s*g$/i.test(d) || /^\d+([.,]\d+)?g$/i.test(d);
}

function is1gServing(s) {
  return s.serving_id === 'derived-1g' || /^1\s*g$|^1g$/i.test(String(s.serving_description || '').trim());
}

function getServingsWithStandardOptions(food) {
  const raw = food?.servings?.serving;
  const list = Array.isArray(raw) ? [...raw] : [];
  const per100 = getPer100g(food);
  if (!per100) return list;
  if (!list.some(is1gServing)) {
    list.unshift({
      serving_id: 'derived-1g',
      serving_description: '1 g',
      calories: Math.round(per100.calories / 100 * 10) / 10,
      protein: Math.round(per100.protein / 100 * 100) / 100,
      carbohydrate: Math.round(per100.carbs / 100 * 100) / 100,
      fat: Math.round(per100.fat / 100 * 100) / 100,
      metric_serving_amount: 1,
      metric_serving_unit: 'g',
    });
  }
  return list.filter((s) => !isGramOnlyServing(s) || is1gServing(s));
}

async function lookupBarcodeAndOpenFoodInternal(code, openFoodDetail) {
  const trimmed = String(code || '').trim();
  if (!trimmed) return { ok: false, error: 'empty' };
  try {
    const data = await nutritionApi.nutritionBarcodeLookup(trimmed);
    const fatSecretFood =
      data?.food ??
      data?.foods?.food ??
      null;
    if (!fatSecretFood) {
      return { ok: false, error: 'no_food' };
    }
    const raw = fatSecretFood?.servings?.serving;
    const servingArr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const servings = getServingsWithStandardOptions({ servings: { serving: servingArr } });
    if (!servings.length) {
      return { ok: false, error: 'no_servings' };
    }
    const oneGIdx = servings.findIndex(
      (s) =>
        s.serving_id === 'derived-1g' ||
        /^1\s*g$|^1g$/i.test(String(s.serving_description || '').trim())
    );
    const firstNonDerived = servings.findIndex(
      (s) => !String(s.serving_id).startsWith('derived-')
    );
    const idx = oneGIdx >= 0 ? oneGIdx : (firstNonDerived >= 0 ? firstNonDerived : 0);
    const foodId = fatSecretFood.food_id ?? fatSecretFood.id;
    const foodName = fatSecretFood.food_name ?? fatSecretFood.name ?? 'Alimento';
    const foodCategory = fatSecretFood.food_category ?? null;
    await openFoodDetail(foodId, foodName, foodCategory, servings, idx, '1');
    return { ok: true };
  } catch (e) {
    logger.error('[NutritionScreen] barcode lookup:', e);
    if (e && typeof e === 'object' && 'status' in e && e.status === 404) {
      return { ok: false, error: 'no_food' };
    }
    return { ok: false, error: 'request_failed' };
  }
}

function chipLabel(servingDescription) {
  if (!servingDescription) return '?';
  const d = servingDescription.trim();
  const m = d.match(/^[\d.,]+\s+(.+)$/);
  if (m) {
    const unit = m[1].trim();
    return unit.charAt(0).toUpperCase() + unit.slice(1);
  }
  return d.length > 12 ? d.slice(0, 12) + '…' : d;
}

const DEFAULT_MEAL_CATEGORIES = [
  { id: 'breakfast', label: 'Desayuno' },
  { id: 'lunch', label: 'Almuerzo' },
  { id: 'dinner', label: 'Cena' },
  { id: 'snack', label: 'Snack' },
];

const MICROS = [
  { key: 'saturated_fat',       label: 'Grasa saturada',       unit: 'g' },
  { key: 'polyunsaturated_fat', label: 'Grasa poliinsaturada', unit: 'g' },
  { key: 'monounsaturated_fat', label: 'Grasa monoinsaturada', unit: 'g' },
  { key: 'cholesterol',         label: 'Colesterol',           unit: 'mg' },
  { key: 'sodium',              label: 'Sodio',                unit: 'mg' },
  { key: 'potassium',           label: 'Potasio',              unit: 'mg' },
  { key: 'fiber',               label: 'Fibra',                unit: 'g' },
  { key: 'sugar',               label: 'Azúcar',               unit: 'g' },
  { key: 'vitamin_a',           label: 'Vitamina A',           unit: '%' },
  { key: 'vitamin_c',           label: 'Vitamina C',           unit: '%' },
  { key: 'calcium',             label: 'Calcio',               unit: 'mg' },
  { key: 'iron',                label: 'Hierro',               unit: 'mg' },
];

function BarcodeCameraScanner({ onClose, onBarcodeScanned, onFallbackToManual }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const lastResultRef = useRef('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const start = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (!isMounted) return;
        if (onFallbackToManual) onFallbackToManual();
        return;
      }
      try {
        const reader = new BrowserMultiFormatReader({
          delayBetweenScanAttempts: 200,
          delayBetweenScanSuccess: 900,
        });
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, err) => {
            if (!isMounted) return;
            if (result) {
              const text = typeof result.getText === 'function' ? result.getText() : result.text;
              if (text && text !== lastResultRef.current) {
                lastResultRef.current = text;
                if (onBarcodeScanned) onBarcodeScanned(text);
              }
              return;
            }
            if (err && !(err instanceof NotFoundException)) {
              logger.warn('[BarcodeCameraScanner] decode error:', err);
            }
          }
        );
        controlsRef.current = controls;
      } catch (e) {
        if (!isMounted) return;
        logger.error('[BarcodeCameraScanner] start error:', e);
        setLocalError('No pudimos acceder a la cámara. Intenta escribir el código manualmente.');
        if (onFallbackToManual) onFallbackToManual();
      }
    };

    start();

    return () => {
      isMounted = false;
      try {
        if (controlsRef.current && typeof controlsRef.current.stop === 'function') {
          controlsRef.current.stop();
        }
      } catch (e) {
        logger.warn('[BarcodeCameraScanner] stop error:', e);
      }
      controlsRef.current = null;
    };
  }, [onBarcodeScanned, onFallbackToManual]);

  return (
    <View style={[styles.createMealModalRoot, styles.barcodeCameraRoot]}>
      <View style={styles.barcodeCameraBody}>
        <Text style={styles.createMealLabel}>Escanea el código de barras</Text>
        <View style={styles.barcodeCameraPreview}>
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16 }}
            muted
            playsInline
            autoPlay
          />
          <View pointerEvents="none" style={styles.barcodeCameraFrame} />
        </View>
        <Text style={styles.barcodeHelperText}>Apunta el código dentro del recuadro</Text>
        {localError ? <Text style={styles.barcodeErrorText}>{localError}</Text> : null}
        <TouchableOpacity
          style={[styles.crearComidaBtn, styles.barcodeCameraCloseBtn]}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <Text style={styles.crearComidaBtnText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const NutritionScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user } = useAuth();
  const userId = user?.uid ?? auth.currentUser?.uid ?? '';
  const preferredAssignmentId = location.state?.preferredAssignmentId ?? null;
  const initialAssignment = location.state?.initialAssignment ?? null;
  const initialPlan = location.state?.initialPlan ?? null;

  const [assignment, setAssignment] = useState(initialAssignment);
  const [plan, setPlan] = useState(initialPlan);
  const [diaryEntries, setDiaryEntries] = useState([]);
  const needsInitialLoad = !initialPlan && !initialAssignment;
  const [loading, setLoading] = useState(needsInitialLoad);
  const [hasLoaded, setHasLoaded] = useState(!!initialPlan || !!initialAssignment);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [macroShowLeft, setMacroShowLeft] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addModalTab, setAddModalTab] = useState('opciones');
  const [addModalCategoryIndex, setAddModalCategoryIndex] = useState(0);
  const [addModalCategoryDropdownOpen, setAddModalCategoryDropdownOpen] = useState(false);
  const [opcionesCardIndex, setOpcionesCardIndex] = useState(0);
  const [addOptionLoading, setAddOptionLoading] = useState(false);
  const [opcionesSelectedByCard, setOpcionesSelectedByCard] = useState({});
  const [recipeVideoModalUrl, setRecipeVideoModalUrl] = useState(null);
  const opcionesScrollX = useRef(new Animated.Value(0)).current;
  const opcionesScrollRef = useRef(null);

  // Buscar tab state
  const [buscarQuery, setBuscarQuery] = useState('');
  const [buscarResults, setBuscarResults] = useState([]);
  const [buscarLoading, setBuscarLoading] = useState(false);
  const [buscarShowSaved, setBuscarShowSaved] = useState(false);
  const [savedFoods, setSavedFoods] = useState([]);
  const [savedFoodsLoaded, setSavedFoodsLoaded] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [buscarServingIndex, setBuscarServingIndex] = useState(0);
  const [buscarAmount, setBuscarAmount] = useState('1');
  const [buscarAddLoading, setBuscarAddLoading] = useState(false);
  const [buscarSortBy, setBuscarSortBy] = useState('relevance');
  const [buscarFilterOpen, setBuscarFilterOpen] = useState(false);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeCameraOpen, setBarcodeCameraOpen] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');
  const [buscarHistory, setBuscarHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wake_food_items') || '[]'); } catch { return []; }
  });
  const [fdShowMicros, setFdShowMicros] = useState(false);
  const [fdLoadingDetail, setFdLoadingDetail] = useState(false);
  const [editingDiaryEntry, setEditingDiaryEntry] = useState(null);
  const [fdCreateMeal, setFdCreateMeal] = useState(false);
  const [menuEntryId, setMenuEntryId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState({ pageY: 0 });

  // Mis comidas (user-created meals)
  const [userMeals, setUserMeals] = useState([]);
  const [userMealsLoading, setUserMealsLoading] = useState(false);
  const [misComidasSelectedByCard, setMisComidasSelectedByCard] = useState({});
  const [misComidasQuery, setMisComidasQuery] = useState('');
  const [misComidasSubTab, setMisComidasSubTab] = useState('meals');
  const [misComidasAddChoiceOpen, setMisComidasAddChoiceOpen] = useState(false);
  const [createMealModalOpen, setCreateMealModalOpen] = useState(false);
  const [createMealName, setCreateMealName] = useState('');
  const [createMealItems, setCreateMealItems] = useState([]);
  const [createMealSaving, setCreateMealSaving] = useState(false);
  const [createMealSearchQuery, setCreateMealSearchQuery] = useState('');
  const [createMealSearchResults, setCreateMealSearchResults] = useState([]);
  const [createMealSearchLoading, setCreateMealSearchLoading] = useState(false);
  const [createMealSearchHistory, setCreateMealSearchHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wake_create_meal_search_history') || '[]'); } catch { return []; }
  });
  const [createMealEditingItemIndex, setCreateMealEditingItemIndex] = useState(null);
  const [createMealSelectedFood, setCreateMealSelectedFood] = useState(null);
  const [createMealServingIndex, setCreateMealServingIndex] = useState(0);
  const [createMealServingAmount, setCreateMealServingAmount] = useState('1');
  const [createMealSearchOpen, setCreateMealSearchOpen] = useState(false);
  const [createMealSearchShowSaved, setCreateMealSearchShowSaved] = useState(false);
  const [createMealSearchSortBy, setCreateMealSearchSortBy] = useState('relevance');

  // Crear/editar alimento manual (custom food, single or multiple servings)
  const [createFoodModalOpen, setCreateFoodModalOpen] = useState(false);
  const [editingSavedFood, setEditingSavedFood] = useState(null);
  const [selectedSavedFoodForEdit, setSelectedSavedFoodForEdit] = useState(null);
  const [createFoodName, setCreateFoodName] = useState('');
  const [createFoodCategory, setCreateFoodCategory] = useState('');
  const [createFoodServings, setCreateFoodServings] = useState([
    { serving_id: '0', serving_description: '1 porción', grams_per_unit: '', calories: '', protein: '', carbs: '', fat: '' },
  ]);
  const [createFoodSaving, setCreateFoodSaving] = useState(false);

  const fdServingsInputRef = useRef(null);
  const fdSlideAnim = useRef(new Animated.Value(0)).current;
  const createMealSlideAnim = useRef(new Animated.Value(0)).current;
  const addModalSlideAnim = useRef(new Animated.Value(0)).current;

  const savedFoodIds = useMemo(() => new Set(savedFoods.map((f) => f.food_id)), [savedFoods]);

  const sortedBuscarResults = useMemo(() => {
    if (buscarSortBy === 'relevance') return buscarResults;
    const getServing = (food) => {
      const raw = food?.servings?.serving;
      return Array.isArray(raw) ? raw[0] : raw;
    };
    return [...buscarResults].sort((a, b) => {
      const sa = getServing(a);
      const sb = getServing(b);
      if (buscarSortBy === 'cal_asc') return (Number(sa?.calories) || 0) - (Number(sb?.calories) || 0);
      if (buscarSortBy === 'cal_desc') return (Number(sb?.calories) || 0) - (Number(sa?.calories) || 0);
      if (buscarSortBy === 'protein_desc') return (Number(sb?.protein) || 0) - (Number(sa?.protein) || 0);
      if (buscarSortBy === 'name_asc') return (a.food_name ?? '').localeCompare(b.food_name ?? '');
      return 0;
    });
  }, [buscarResults, buscarSortBy]);

  const sortedSavedFoods = useMemo(() => {
    if (buscarSortBy === 'relevance') return savedFoods;
    return [...savedFoods].sort((a, b) => {
      if (buscarSortBy === 'cal_asc') return (a.calories_per_unit || 0) - (b.calories_per_unit || 0);
      if (buscarSortBy === 'cal_desc') return (b.calories_per_unit || 0) - (a.calories_per_unit || 0);
      if (buscarSortBy === 'protein_desc') return (b.protein_per_unit || 0) - (a.protein_per_unit || 0);
      if (buscarSortBy === 'name_asc') return (a.name ?? '').localeCompare(b.name ?? '');
      return 0;
    });
  }, [savedFoods, buscarSortBy]);

  const misComidasFilteredMeals = useMemo(() => {
    const q = (misComidasQuery ?? '').trim().toLowerCase();
    if (!q) return userMeals;
    return userMeals.filter((m) => (m.name ?? '').toLowerCase().includes(q));
  }, [userMeals, misComidasQuery]);

  const customSavedFoods = useMemo(
    () => savedFoods.filter((f) => (f.food_id || '').startsWith('custom-')),
    [savedFoods]
  );

  const misComidasFilteredFoods = useMemo(() => {
    const q = (misComidasQuery ?? '').trim().toLowerCase();
    if (!q) return customSavedFoods;
    return customSavedFoods.filter((f) => (f.name ?? '').toLowerCase().includes(q));
  }, [customSavedFoods, misComidasQuery]);

  function getMealIdForCategory(cat) {
    if (!cat) return 'snack';
    const id = cat.id ?? '';
    if (id === 'snacks') return 'snack';
    if (['breakfast', 'lunch', 'dinner', 'snack'].includes(id)) return id;
    const label = (cat.label ?? '').toLowerCase();
    if (label.includes('desayuno')) return 'breakfast';
    if (label.includes('almuerzo')) return 'lunch';
    if (label.includes('cena')) return 'dinner';
    return 'snack';
  }

  const fetchDatesWithEntries = useCallback(
    async (startDate, endDate) => {
      if (!userId) return [];
      try {
        return await nutritionDb.getDatesWithEntries(userId, startDate, endDate);
      } catch (e) {
        logger.error('[NutritionScreen] getDatesWithEntries error:', e);
        return [];
      }
    },
    [userId]
  );

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const dateForPlan = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date();
      const { plan: p, assignment: a } = preferredAssignmentId
        ? await nutritionDb.getPlanForAssignmentId(userId, preferredAssignmentId, dateForPlan)
        : await nutritionDb.getEffectivePlanForUser(userId, dateForPlan);
      setAssignment(a);
      setPlan(p);
    } catch (e) {
      logger.error('[NutritionScreen] load plan error:', e);
    }
    try {
      const entries = await nutritionDb.getDiaryEntries(userId, selectedDate);
      setDiaryEntries(entries);
    } catch (e) {
      logger.error('[NutritionScreen] getDiaryEntries error:', e);
    }
    setLoading(false);
    setHasLoaded(true);
  }, [userId, selectedDate, preferredAssignmentId]);

  useEffect(() => {
    if (!userId) return;
    loadData();
  }, [userId, loadData]);

  const handleAddOptionToMeal = useCallback(
    async (option, category, selectedIndices) => {
      if (!userId || !selectedDate) return;
      const items = option?.items ?? option?.foods ?? [];
      const foodItems = items.filter((it) => it.recipe !== true);
      const toAdd =
        selectedIndices.length > 0
          ? selectedIndices.map((i) => items[i]).filter((it) => it && it.recipe !== true)
          : foodItems;
      if (toAdd.length === 0) return;
      const meal = getMealIdForCategory(category);
      setAddOptionLoading(true);
      try {
        for (const it of toAdd) {
          const number_of_units = it.number_of_units ?? it.units ?? it.amount ?? 1;
          await nutritionDb.addDiaryEntry(userId, {
            date: selectedDate,
            meal,
            food_id: it.food_id ?? `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            serving_id: it.serving_id ?? '0',
            number_of_units: Number(number_of_units) || 1,
            name: it.name ?? 'Alimento',
            food_category: it.food_category ?? null,
            calories: it.calories != null ? Number(it.calories) : null,
            protein:
              it.protein != null
                ? Number(it.protein)
                : it.protein_g != null
                  ? Number(it.protein_g)
                  : null,
            carbs:
              it.carbs != null
                ? Number(it.carbs)
                : it.carbs_g != null
                  ? Number(it.carbs_g)
                  : it.carbohydrate != null
                    ? Number(it.carbohydrate)
                    : null,
            fat:
              it.fat != null
                ? Number(it.fat)
                : it.fat_g != null
                  ? Number(it.fat_g)
                  : null,
            serving_unit: it.serving_unit ?? null,
            grams_per_unit: it.grams_per_unit ?? null,
            servings: it.servings ?? null,
          });
        }
        activityStreakService.updateActivityStreak(userId, selectedDate).catch(() => {});
        await loadData();
        setAddModalVisible(false);
      } catch (e) {
        logger.error('[NutritionScreen] handleAddOptionToMeal error:', e);
      } finally {
        setAddOptionLoading(false);
      }
    },
    [userId, selectedDate, loadData]
  );

  const handleAddUserMealToDiary = useCallback(
    async (meal, mealCategory) => {
      if (!userId || !selectedDate || !meal || !Array.isArray(meal.items)) return;
      const items = meal.items;
      if (items.length === 0) return;
      const mealId = getMealIdForCategory(mealCategory);
      setAddOptionLoading(true);
      try {
        const selectedSet = misComidasSelectedByCard[meal.id] ?? [];
        const toAdd =
          Array.isArray(selectedSet) && selectedSet.length > 0
            ? selectedSet
                .map((i) => items[i])
                .filter((it) => it && it.recipe !== true)
            : items.filter((it) => it && it.recipe !== true);
        if (toAdd.length === 0) return;
        for (const it of toAdd) {
          const number_of_units = it.number_of_units ?? it.units ?? it.amount ?? 1;
          await nutritionDb.addDiaryEntry(userId, {
            date: selectedDate,
            meal: mealId,
            food_id: it.food_id ?? `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            serving_id: it.serving_id ?? '0',
            number_of_units: Number(number_of_units) || 1,
            name: it.name ?? 'Alimento',
            food_category: it.food_category ?? null,
            calories: it.calories != null ? Number(it.calories) : null,
            protein:
              it.protein != null
                ? Number(it.protein)
                : it.protein_g != null
                  ? Number(it.protein_g)
                  : null,
            carbs:
              it.carbs != null
                ? Number(it.carbs)
                : it.carbs_g != null
                  ? Number(it.carbs_g)
                  : it.carbohydrate != null
                    ? Number(it.carbohydrate)
                    : null,
            fat:
              it.fat != null
                ? Number(it.fat)
                : it.fat_g != null
                  ? Number(it.fat_g)
                  : null,
            serving_unit: it.serving_unit ?? null,
            grams_per_unit: it.grams_per_unit ?? null,
            servings: it.servings ?? null,
          });
        }
        activityStreakService.updateActivityStreak(userId, selectedDate).catch(() => {});
        await loadData();
        setAddModalVisible(false);
      } catch (e) {
        logger.error('[NutritionScreen] handleAddUserMealToDiary error:', e);
      } finally {
        setAddOptionLoading(false);
      }
    },
    [userId, selectedDate, misComidasSelectedByCard, loadData]
  );

  const loadSavedFoods = useCallback(async () => {
    if (!userId || savedFoodsLoaded) return;
    try {
      const foods = await nutritionDb.getSavedFoods(userId);
      setSavedFoods(foods);
    } catch (e) {
      logger.error('[NutritionScreen] loadSavedFoods:', e);
    } finally {
      setSavedFoodsLoaded(true);
    }
  }, [userId, savedFoodsLoaded]);

  const runSearch = useCallback(async (term) => {
    if (!term.trim()) return;
    setBuscarQuery(term);
    setBuscarLoading(true);
    setBuscarResults([]);
    setSelectedFood(null);
    try {
      const data = await nutritionApi.nutritionFoodSearch(term.trim(), 0, 20);
      const foods = data?.foods_search?.results?.food ?? [];
      setBuscarResults(Array.isArray(foods) ? foods : []);
    } catch (e) {
      logger.error('[NutritionScreen] buscar search:', e);
      setBuscarResults([]);
    } finally {
      setBuscarLoading(false);
    }
  }, []);

  const handleBuscarSearch = useCallback(() => runSearch(buscarQuery), [runSearch, buscarQuery]);

  const openFoodDetail = useCallback(async (foodId, foodName, foodCategory, initialServings, initialServingIdx, initialAmount) => {
    setEditingDiaryEntry(null);
    setSelectedFood({ food_id: foodId, food_name: foodName, food_category: foodCategory ?? null, servings: initialServings });
    setBuscarServingIndex(initialServingIdx);
    setBuscarAmount(initialAmount);
    setFdShowMicros(false);
    if ((foodId || '').startsWith('custom-')) {
      setFdLoadingDetail(false);
      return;
    }
    setFdLoadingDetail(true);
    setBuscarHistory((prev) => {
      const item = { food_id: foodId, food_name: foodName };
      const next = [item, ...prev.filter((h) => h.food_id !== foodId)].slice(0, 10);
      try { localStorage.setItem('wake_food_items', JSON.stringify(next)); } catch {}
      return next;
    });
    try {
      const fullData = await nutritionApi.nutritionFoodGet(foodId);
      const fullRaw = fullData?.food?.servings?.serving;
      if (!fullRaw) return;
      const fullServingArr = Array.isArray(fullRaw) ? fullRaw : [fullRaw];
      const fullServings = getServingsWithStandardOptions({ servings: { serving: fullServingArr } });
      setSelectedFood((prev) => prev?.food_id === foodId ? { ...prev, servings: fullServings } : prev);
      const oneGIdx = fullServings.findIndex((s) => s.serving_id === 'derived-1g' || /^1\s*g$/i.test(String(s.serving_description || '').trim()));
      const fallback = fullServings.findIndex((s) => !String(s.serving_id).startsWith('derived-'));
      setBuscarServingIndex(oneGIdx >= 0 ? oneGIdx : (fallback >= 0 ? fallback : 0));
    } catch (e) {
      logger.warn('[NutritionScreen] nutritionFoodGet detail:', e);
    } finally {
      setFdLoadingDetail(false);
    }
  }, []);

  const lookupBarcodeAndOpenFood = useCallback(
    (code) => lookupBarcodeAndOpenFoodInternal(code, openFoodDetail),
    [openFoodDetail]
  );

  const handleBarcodeLookup = useCallback(async () => {
    const code = barcodeValue.trim();
    if (!code) return;
    setBarcodeLoading(true);
    setBarcodeError('');
    try {
      const { ok, error } = await lookupBarcodeAndOpenFood(code);
      if (ok) {
        setBarcodeModalOpen(false);
        setBarcodeValue('');
        setBarcodeError('');
        return;
      }
      if (error === 'no_food') {
        setBarcodeError('No encontramos ningún alimento para este código de barras.');
      } else if (error === 'no_servings') {
        setBarcodeError('No pudimos obtener porciones para este código de barras.');
      } else {
        setBarcodeError('No pudimos buscar este código de barras. Inténtalo de nuevo.');
      }
    } finally {
      setBarcodeLoading(false);
    }
  }, [barcodeValue, lookupBarcodeAndOpenFood]);

  const handleSelectFood = useCallback((food) => {
    const raw = food?.servings?.serving;
    const servingArr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const servings = getServingsWithStandardOptions({ servings: { serving: servingArr } });
    const oneGIdx = servings.findIndex((s) => s.serving_id === 'derived-1g' || /^1\s*g$/i.test(String(s.serving_description || '').trim()));
    const firstNonDerived = servings.findIndex((s) => !String(s.serving_id).startsWith('derived-'));
    const idx = oneGIdx >= 0 ? oneGIdx : (firstNonDerived >= 0 ? firstNonDerived : 0);
    openFoodDetail(food.food_id, food.food_name ?? food.name ?? '', food.food_category ?? null, servings, idx, '1');
  }, [openFoodDetail]);

  const handleSelectSavedFood = useCallback((savedFood) => {
    if ((savedFood.food_id || '').startsWith('custom-')) {
      setSelectedSavedFoodForEdit(savedFood);
    } else {
      setSelectedSavedFoodForEdit(null);
    }
    const storedServings = savedFood.servings;
    const servings = Array.isArray(storedServings) && storedServings.length > 0
      ? storedServings
      : [{
          serving_id: savedFood.serving_id ?? '0',
          serving_description: savedFood.serving_description ?? '1 porción',
          calories: savedFood.calories_per_unit ?? 0,
          protein: savedFood.protein_per_unit ?? 0,
          carbohydrate: savedFood.carbs_per_unit ?? 0,
          fat: savedFood.fat_per_unit ?? 0,
          metric_serving_amount: savedFood.grams_per_unit ?? null,
          metric_serving_unit: 'g',
        }];
    const idx = servings.findIndex((s) => s.serving_id === savedFood.serving_id);
    openFoodDetail(savedFood.food_id, savedFood.name, savedFood.food_category ?? null, servings, idx >= 0 ? idx : 0, String(savedFood.number_of_units ?? 1));
  }, [openFoodDetail]);

  const handleEditDiaryEntry = useCallback((entry) => {
    const storedServings = entry.servings;
    const hasStoredServings = Array.isArray(storedServings) && storedServings.length > 0;
    let servings;
    let servingIndex = 0;
    let initialAmount = String(entry.number_of_units ?? 1);
    if (hasStoredServings) {
      servings = storedServings.filter((s) => !isGramOnlyServing(s) || is1gServing(s));
      if (servings.length === 0) servings = storedServings;
      const idx = servings.findIndex((s) => String(s.serving_id) === String(entry.serving_id));
      servingIndex = idx >= 0 ? idx : 0;
      const entryServing = storedServings.find((s) => String(s.serving_id) === String(entry.serving_id));
      if (entryServing && isGramOnlyServing(entryServing) && !is1gServing(entryServing) && entry.grams_per_unit != null) {
        initialAmount = String(Math.round(Number(entry.number_of_units) * Number(entry.grams_per_unit)));
      }
    } else {
      const n = Number(entry.number_of_units) || 1;
      const gpu = entry.grams_per_unit != null ? Number(entry.grams_per_unit) : null;
      const unitDesc = (entry.serving_unit ?? '').trim();
      const isGramBased = gpu != null && /(\d+\s*)?(g|ml)\s*$/i.test(unitDesc);
      if (isGramBased) {
        const totalG = Math.round(n * gpu);
        servings = [{
          serving_id: 'derived-1g',
          serving_description: '1 g',
          calories: Math.round((Number(entry.calories) || 0) / totalG * 1000) / 1000,
          protein: Math.round((Number(entry.protein) || 0) / totalG * 1000) / 1000,
          carbohydrate: Math.round((Number(entry.carbs) || 0) / totalG * 1000) / 1000,
          fat: Math.round((Number(entry.fat) || 0) / totalG * 1000) / 1000,
          metric_serving_amount: 1,
          metric_serving_unit: 'g',
        }];
        servingIndex = 0;
        initialAmount = String(totalG);
      } else {
        servings = [{
          serving_id: entry.serving_id ?? '0',
          serving_description: entry.serving_unit ?? '1 porción',
          calories: (Number(entry.calories) || 0) / n,
          protein: (Number(entry.protein) || 0) / n,
          carbohydrate: (Number(entry.carbs) || 0) / n,
          fat: (Number(entry.fat) || 0) / n,
          metric_serving_amount: gpu,
          metric_serving_unit: 'g',
        }];
      }
    }
    setEditingDiaryEntry(entry);
    setSelectedFood({
      food_id: entry.food_id,
      food_name: entry.name ?? 'Alimento',
      food_category: entry.food_category ?? null,
      servings,
    });
    setBuscarServingIndex(servingIndex);
    setBuscarAmount(initialAmount);
    setFdShowMicros(false);
  }, []);

  const handleDeleteDiaryEntry = useCallback(async (entry) => {
    setMenuEntryId(null);
    try {
      await nutritionDb.deleteDiaryEntry(userId, entry.id);
      setDiaryEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err) {
      logger.error('[NutritionScreen] deleteDiaryEntry error:', err);
    }
  }, [userId]);

  const addCreateMealIngredientFromFood = useCallback((food, serving, amount) => {
    const mult = Number(amount) || 1;
    const item = {
      food_id: food.food_id,
      serving_id: serving.serving_id,
      number_of_units: mult,
      name: food.food_name ?? food.name ?? 'Alimento',
      food_category: food.food_category ?? null,
      calories: serving.calories != null ? Math.round(Number(serving.calories) * mult) : null,
      protein: serving.protein != null ? Math.round(Number(serving.protein) * mult * 10) / 10 : null,
      carbs: serving.carbohydrate != null ? Math.round(Number(serving.carbohydrate) * mult * 10) / 10 : null,
      fat: serving.fat != null ? Math.round(Number(serving.fat) * mult * 10) / 10 : null,
      serving_unit: serving.serving_description ?? null,
      grams_per_unit: serving.metric_serving_amount != null ? Number(serving.metric_serving_amount) : null,
      servings: food.servings ?? null,
    };
    setCreateMealItems((prev) => [...prev, item]);
    setCreateMealSelectedFood(null);
    setCreateMealServingIndex(0);
    setCreateMealServingAmount('1');
  }, []);

  const handleBuscarLog = useCallback(async () => {
    if (!userId || !selectedFood) return;
    const serving = selectedFood.servings[buscarServingIndex];
    if (!serving) return;
    const qty = Number(buscarAmount) || 1;
    if (fdCreateMeal) {
      if (createMealEditingItemIndex !== null) {
        const mult = qty;
        const updatedItem = {
          food_id: selectedFood.food_id,
          serving_id: serving.serving_id,
          number_of_units: mult,
          name: selectedFood.food_name ?? selectedFood.name ?? 'Alimento',
          food_category: selectedFood.food_category ?? null,
          calories: serving.calories != null ? Math.round(Number(serving.calories) * mult) : null,
          protein: serving.protein != null ? Math.round(Number(serving.protein) * mult * 10) / 10 : null,
          carbs: serving.carbohydrate != null ? Math.round(Number(serving.carbohydrate) * mult * 10) / 10 : null,
          fat: serving.fat != null ? Math.round(Number(serving.fat) * mult * 10) / 10 : null,
          serving_unit: serving.serving_description ?? null,
          grams_per_unit: serving.metric_serving_amount != null ? Number(serving.metric_serving_amount) : null,
          servings: selectedFood.servings ?? null,
        };
        setCreateMealItems((prev) => prev.map((it, i) => (i === createMealEditingItemIndex ? updatedItem : it)));
        setCreateMealEditingItemIndex(null);
      } else {
        addCreateMealIngredientFromFood(selectedFood, serving, String(qty));
      }
      setSelectedFood(null);
      setFdCreateMeal(false);
      return;
    }
    if (!selectedDate) return;
    setBuscarAddLoading(true);
    try {
      if (editingDiaryEntry) {
        await nutritionDb.updateDiaryEntry(userId, editingDiaryEntry.id, {
          serving_id: serving.serving_id,
          number_of_units: qty,
          calories: Math.round((Number(serving.calories) || 0) * qty),
          protein: Math.round((Number(serving.protein) || 0) * qty * 10) / 10,
          carbs: Math.round((Number(serving.carbohydrate) || 0) * qty * 10) / 10,
          fat: Math.round((Number(serving.fat) || 0) * qty * 10) / 10,
          serving_unit: serving.serving_description ?? null,
          grams_per_unit: serving.metric_serving_amount != null ? Number(serving.metric_serving_amount) : null,
          servings: selectedFood.servings ?? undefined,
        });
        await loadData();
        setSelectedFood(null);
        setEditingDiaryEntry(null);
      } else {
        const activeCats = (plan?.categories ?? []).filter(
          (cat) => (cat.options ?? cat.meal_options ?? []).length > 0
        );
        const fallbackCats = activeCats.length > 0 ? activeCats : DEFAULT_MEAL_CATEGORIES;
        const catIdx = Math.min(addModalCategoryIndex, Math.max(0, fallbackCats.length - 1));
        const meal = getMealIdForCategory(fallbackCats[catIdx] ?? null);
        await nutritionDb.addDiaryEntry(userId, {
          date: selectedDate,
          meal,
          food_id: selectedFood.food_id,
          serving_id: serving.serving_id,
          number_of_units: qty,
          name: selectedFood.food_name,
          food_category: selectedFood.food_category ?? null,
          calories: Math.round((Number(serving.calories) || 0) * qty),
          protein: Math.round((Number(serving.protein) || 0) * qty * 10) / 10,
          carbs: Math.round((Number(serving.carbohydrate) || 0) * qty * 10) / 10,
          fat: Math.round((Number(serving.fat) || 0) * qty * 10) / 10,
          serving_unit: serving.serving_description ?? null,
          grams_per_unit: serving.metric_serving_amount != null ? Number(serving.metric_serving_amount) : null,
          servings: selectedFood.servings ?? null,
        });
        activityStreakService.updateActivityStreak(userId, selectedDate).catch(() => {});
        await loadData();
        setAddModalVisible(false);
      }
    } catch (e) {
      logger.error('[NutritionScreen] handleBuscarLog:', e);
    } finally {
      setBuscarAddLoading(false);
    }
  }, [userId, selectedDate, selectedFood, buscarServingIndex, buscarAmount, plan, addModalCategoryIndex, loadData, editingDiaryEntry, fdCreateMeal, createMealEditingItemIndex, addCreateMealIngredientFromFood]);

  const handleToggleSaveFood = useCallback(async () => {
    if (!userId || !selectedFood) return;
    const serving = selectedFood.servings[buscarServingIndex];
    if (!serving) return;
    const existing = savedFoods.find((f) => f.food_id === selectedFood.food_id);
    if (existing) {
      try {
        await nutritionDb.deleteSavedFood(userId, existing.id);
        setSavedFoods((prev) => prev.filter((f) => f.id !== existing.id));
      } catch (e) {
        logger.error('[NutritionScreen] deleteSavedFood:', e);
      }
      return;
    }
    try {
      const id = await nutritionDb.saveFood(userId, {
        food_id: selectedFood.food_id,
        name: selectedFood.food_name,
        food_category: selectedFood.food_category ?? null,
        serving_id: serving.serving_id,
        serving_description: serving.serving_description,
        number_of_units: Number(buscarAmount) || 1,
        calories_per_unit: Number(serving.calories) || null,
        protein_per_unit: Number(serving.protein) || null,
        carbs_per_unit: Number(serving.carbohydrate) || null,
        fat_per_unit: Number(serving.fat) || null,
        grams_per_unit: serving.metric_serving_amount != null ? Number(serving.metric_serving_amount) : null,
        servings: selectedFood.servings,
      });
      setSavedFoods((prev) => [
        { id, food_id: selectedFood.food_id, name: selectedFood.food_name, food_category: selectedFood.food_category, serving_id: serving.serving_id, serving_description: serving.serving_description, number_of_units: Number(buscarAmount) || 1, calories_per_unit: Number(serving.calories), servings: selectedFood.servings },
        ...prev,
      ]);
    } catch (e) {
      logger.error('[NutritionScreen] saveFood:', e);
    }
  }, [userId, selectedFood, buscarServingIndex, buscarAmount, savedFoods]);

  const faltanOpacity = useRef(new Animated.Value(1)).current;
  const llevasOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(faltanOpacity, {
        toValue: macroShowLeft ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(llevasOpacity, {
        toValue: macroShowLeft ? 0 : 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [macroShowLeft, faltanOpacity, llevasOpacity]);

  const consumed = useMemo(() => sumDiary(diaryEntries), [diaryEntries]);
  const planned = useMemo(
    () => ({
      calories: Number(plan?.daily_calories) || 0,
      protein: Number(plan?.daily_protein_g) ?? Number(plan?.daily_protein) ?? 0,
      carbs: Number(plan?.daily_carbs_g) ?? Number(plan?.daily_carbs) ?? 0,
      fat: Number(plan?.daily_fat_g) ?? Number(plan?.daily_fat) ?? 0,
    }),
    [plan]
  );
  const left = useMemo(
    () => ({
      calories: Math.max(0, planned.calories - consumed.calories),
      protein: Math.max(0, planned.protein - consumed.protein),
      carbs: Math.max(0, planned.carbs - consumed.carbs),
      fat: Math.max(0, planned.fat - consumed.fat),
    }),
    [planned, consumed]
  );

  const caloriesPieData = useMemo(() => {
    const cap = planned.calories || 1;
    const eaten = Math.min(consumed.calories, cap);
    const over = Math.max(0, consumed.calories - (planned.calories || 0));
    const remaining = Math.max(0, (planned.calories || 0) - eaten);
    if (planned.calories <= 0) return [{ name: 'Sin meta', value: 1, fill: REMAINING_GRAY }];
    if (eaten <= 0 && over <= 0 && remaining <= 0) return [{ name: 'Restante', value: 1, fill: REMAINING_GRAY }];
    const data = [];
    const fillConsumed = consumed.calories > (planned.calories || 0) ? OVER_LIMIT_RED : GOLD_FILL;
    if (eaten > 0) data.push({ name: 'Consumido', value: eaten, fill: fillConsumed });
    if (over > 0) data.push({ name: 'Exceso', value: over, fill: OVER_LIMIT_RED });
    if (remaining > 0) data.push({ name: 'Restante', value: remaining, fill: REMAINING_GRAY });
    return data.length ? data : [{ name: 'Restante', value: 1, fill: REMAINING_GRAY }];
  }, [consumed.calories, planned.calories]);

  const macroPie = (consumedVal, plannedVal, key) => {
    const p = plannedVal || 1;
    const inPlan = Math.min(consumedVal, p);
    const over = Math.max(0, consumedVal - p);
    const r = Math.max(0, p - inPlan);
    const data = [];
    const fillConsumed = consumedVal > p ? OVER_LIMIT_RED : GOLD_FILL;
    if (inPlan > 0) data.push({ name: 'c', value: inPlan, fill: fillConsumed });
    if (over > 0) data.push({ name: 'over', value: over, fill: OVER_LIMIT_RED });
    if (r > 0) data.push({ name: 'r', value: r, fill: REMAINING_GRAY });
    return data.length ? data : [{ name: 'r', value: 1, fill: REMAINING_GRAY }];
  };

  const toggleMacroMode = () => {
    setMacroShowLeft((v) => !v);
  };

  const categoriesWithFood = useMemo(() => {
    const cats = plan?.categories;
    if (!Array.isArray(cats)) return [];
    return cats;
  }, [plan?.categories]);

  const diaryByMeal = useMemo(() => {
    const map = {};
    for (const entry of diaryEntries) {
      const mealId = entry.meal ?? 'snack';
      if (!map[mealId]) map[mealId] = [];
      map[mealId].push(entry);
    }
    return map;
  }, [diaryEntries]);

  const effectiveCategories = useMemo(
    () => (categoriesWithFood.length > 0 ? categoriesWithFood : DEFAULT_MEAL_CATEGORIES),
    [categoriesWithFood]
  );
  const selectedCategoryIndex = Math.min(addModalCategoryIndex, Math.max(0, effectiveCategories.length - 1));
  const selectedCategory = effectiveCategories[selectedCategoryIndex] ?? null;
  const opcionesOptions = useMemo(() => {
    if (!selectedCategory) return [];
    return selectedCategory.options ?? selectedCategory.meal_options ?? [];
  }, [selectedCategory]);

  useEffect(() => {
    if (addModalTab === 'opciones') setOpcionesCardIndex(0);
  }, [addModalCategoryIndex, addModalTab]);

  useEffect(() => {
    if (addModalVisible && addModalTab === 'opciones') setOpcionesSelectedByCard({});
  }, [addModalVisible, addModalCategoryIndex, addModalTab]);

  useEffect(() => {
    if (!addModalVisible || addModalTab !== 'opciones') return;
    opcionesScrollX.setValue(0);
    const t = setTimeout(() => {
      if (opcionesScrollRef.current?.scrollTo) {
        opcionesScrollRef.current.scrollTo({ x: 0, animated: false });
      }
    }, 0);
    return () => clearTimeout(t);
  }, [addModalVisible, addModalCategoryIndex, addModalTab, opcionesScrollX]);

  useEffect(() => {
    if (addModalVisible && (addModalTab === 'buscar' || addModalTab === 'mis_comidas')) {
      loadSavedFoods();
    }
  }, [addModalVisible, addModalTab, loadSavedFoods]);

  useEffect(() => {
    if (createMealSearchOpen) {
      loadSavedFoods();
    }
  }, [createMealSearchOpen, loadSavedFoods]);

  const loadUserMeals = useCallback(async () => {
    if (!userId) return;
    setUserMealsLoading(true);
    try {
      const meals = await nutritionDb.getUserMeals(userId);
      setUserMeals(meals ?? []);
    } catch (e) {
      logger.error('[NutritionScreen] loadUserMeals:', e);
      setUserMeals([]);
    } finally {
      setUserMealsLoading(false);
    }
  }, [userId]);

  const fdOpenKey = selectedFood?.food_id ?? null;
  useEffect(() => {
    if (fdOpenKey) {
      fdSlideAnim.setValue(0);
      Animated.timing(fdSlideAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start();
    }
  }, [fdOpenKey, fdSlideAnim]);

  const handleFoodDetailClose = useCallback(() => {
    fdSlideAnim.stopAnimation(() => {});
    Animated.timing(fdSlideAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSelectedFood(null);
        setSelectedSavedFoodForEdit(null);
        setEditingDiaryEntry(null);
        setFdShowMicros(false);
        setFdLoadingDetail(false);
        setFdCreateMeal(false);
        setCreateMealEditingItemIndex(null);
      }
    });
  }, [fdSlideAnim]);

  const handleCreateMealClose = useCallback(() => {
    setCreateMealModalOpen(false);
  }, []);

  const handleAddModalOpen = useCallback(() => {
    addModalSlideAnim.setValue(0);
    Animated.timing(addModalSlideAnim, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
    setAddModalVisible(true);
  }, [addModalSlideAnim]);

  const handleAddModalClose = useCallback(() => {
    addModalSlideAnim.stopAnimation(() => {});
    Animated.timing(addModalSlideAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setAddModalVisible(false);
      }
    });
  }, [addModalSlideAnim]);

  useEffect(() => {
    if (addModalVisible && addModalTab === 'mis_comidas') {
      loadUserMeals();
      setMisComidasSelectedByCard({});
    }
  }, [addModalVisible, addModalTab, loadUserMeals]);

  useEffect(() => {
    if (addModalVisible && addModalTab === 'mis_comidas') {
      setMisComidasSelectedByCard({});
      setMisComidasQuery('');
    }
  }, [addModalVisible, addModalCategoryIndex, addModalTab]);

  const runCreateMealSearch = useCallback(async () => {
    if (!createMealSearchQuery.trim()) return;
    setCreateMealSearchLoading(true);
    setCreateMealSearchResults([]);
    try {
      const data = await nutritionApi.nutritionFoodSearch(createMealSearchQuery.trim(), 0, 20);
      const foods = data?.foods_search?.results?.food ?? [];
      setCreateMealSearchResults(Array.isArray(foods) ? foods : []);
    } catch (e) {
      logger.error('[NutritionScreen] createMeal search:', e);
      setCreateMealSearchResults([]);
    } finally {
      setCreateMealSearchLoading(false);
    }
  }, [createMealSearchQuery]);

  const createMealSearchSortedResults = useMemo(() => {
    const list = [...createMealSearchResults];
    const per100 = (f) => getPer100g(f);
    const cmp = (a, b) => {
      const pa = per100(a);
      const pb = per100(b);
      switch (createMealSearchSortBy) {
        case 'cal_asc':
          return (pa?.calories ?? 0) - (pb?.calories ?? 0);
        case 'cal_desc':
          return (pb?.calories ?? 0) - (pa?.calories ?? 0);
        case 'protein_desc':
          return (pb?.protein ?? 0) - (pa?.protein ?? 0);
        case 'name_asc':
          return (a.food_name || '').localeCompare(b.food_name || '');
        default:
          return 0;
      }
    };
    list.sort(cmp);
    return list;
  }, [createMealSearchResults, createMealSearchSortBy]);

  const createMealSearchFilteredSaved = useMemo(() => {
    const q = (createMealSearchQuery ?? '').trim().toLowerCase();
    if (!q) return savedFoods;
    return savedFoods.filter((f) => (f.name || '').toLowerCase().includes(q));
  }, [savedFoods, createMealSearchQuery]);

  const handleSelectSavedFoodForCreateMeal = useCallback((savedFood) => {
    setCreateMealSearchOpen(false);
    setFdCreateMeal(true);
    handleSelectSavedFood(savedFood);
  }, [handleSelectSavedFood]);

  const selectCreateMealFood = useCallback(async (food) => {
    const raw = food?.servings?.serving;
    const servingArr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    let servings = getServingsWithStandardOptions({ servings: { serving: servingArr } });
    if (servings.length === 0 && (food.food_id || food.food_name)) {
      try {
        const fullData = await nutritionApi.nutritionFoodGet(food.food_id);
        const fullRaw = fullData?.food?.servings?.serving;
        if (fullRaw) {
          const arr = Array.isArray(fullRaw) ? fullRaw : [fullRaw];
          servings = getServingsWithStandardOptions({ servings: { serving: arr } });
        }
      } catch (_) {}
    }
    const effectiveServings = servings.length
      ? servings
      : [{
          serving_id: '0',
          serving_description: '1 porción',
          calories: 0,
          protein: 0,
          carbohydrate: 0,
          fat: 0,
          metric_serving_amount: null,
        }];
    const oneGIdx = effectiveServings.findIndex(
      (s) => s.serving_id === 'derived-1g' || /^1\s*g$/i.test(String(s.serving_description || '').trim())
    );
    const firstNonDerived = effectiveServings.findIndex(
      (s) => !String(s.serving_id).startsWith('derived-')
    );
    const idx = oneGIdx >= 0 ? oneGIdx : (firstNonDerived >= 0 ? firstNonDerived : 0);
    setCreateMealSelectedFood({
      food_id: food.food_id,
      food_name: food.food_name ?? food.name ?? 'Alimento',
      food_category: food.food_category ?? null,
      servings: effectiveServings,
    });
    setCreateMealServingIndex(idx);
    setCreateMealServingAmount('1');
  }, []);

  const selectCreateMealFoodAndOpenFd = useCallback(async (food) => {
    setCreateMealSearchHistory((prev) => {
      const item = { food_id: food.food_id, food_name: food.food_name ?? food.name ?? 'Alimento' };
      const next = [item, ...prev.filter((h) => h.food_id !== food.food_id)].slice(0, 10);
      try { localStorage.setItem('wake_create_meal_search_history', JSON.stringify(next)); } catch {}
      return next;
    });
    const raw = food?.servings?.serving;
    const servingArr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    let servings = getServingsWithStandardOptions({ servings: { serving: servingArr } });
    if (servings.length === 0 && (food.food_id || food.food_name)) {
      try {
        const fullData = await nutritionApi.nutritionFoodGet(food.food_id);
        const fullRaw = fullData?.food?.servings?.serving;
        if (fullRaw) {
          const arr = Array.isArray(fullRaw) ? fullRaw : [fullRaw];
          servings = getServingsWithStandardOptions({ servings: { serving: arr } });
        }
      } catch (_) {}
    }
    const effectiveServings = servings.length
      ? servings
      : [{
          serving_id: '0',
          serving_description: '1 porción',
          calories: 0,
          protein: 0,
          carbohydrate: 0,
          fat: 0,
          metric_serving_amount: null,
        }];
    const oneGIdx = effectiveServings.findIndex(
      (s) => s.serving_id === 'derived-1g' || /^1\s*g$/i.test(String(s.serving_description || '').trim())
    );
    const firstNonDerived = effectiveServings.findIndex(
      (s) => !String(s.serving_id).startsWith('derived-')
    );
    const idx = oneGIdx >= 0 ? oneGIdx : (firstNonDerived >= 0 ? firstNonDerived : 0);
    setCreateMealSearchOpen(false);
    setFdCreateMeal(true);
    openFoodDetail(
      food.food_id,
      food.food_name ?? food.name ?? 'Alimento',
      food.food_category ?? null,
      effectiveServings,
      idx,
      '1'
    );
  }, [openFoodDetail]);

  const removeCreateMealItem = useCallback((index) => {
    setCreateMealItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const openCreateMealItemForEdit = useCallback((item, index) => {
    const servings = item.servings && item.servings.length > 0
      ? item.servings
      : [{
          serving_id: item.serving_id || '0',
          serving_description: item.serving_unit || '1 porción',
          calories: item.calories != null ? item.calories / (Number(item.number_of_units) || 1) : 0,
          protein: item.protein != null ? item.protein / (Number(item.number_of_units) || 1) : 0,
          carbohydrate: item.carbs != null ? item.carbs / (Number(item.number_of_units) || 1) : 0,
          fat: item.fat != null ? item.fat / (Number(item.number_of_units) || 1) : 0,
          metric_serving_amount: item.grams_per_unit ?? null,
        }];
    const servingIndex = servings.findIndex((s) => String(s.serving_id) === String(item.serving_id));
    setSelectedFood({
      food_id: item.food_id,
      food_name: item.name || 'Alimento',
      food_category: item.food_category ?? null,
      servings,
    });
    setBuscarServingIndex(servingIndex >= 0 ? servingIndex : 0);
    setBuscarAmount(String(item.number_of_units ?? 1));
    setFdCreateMeal(true);
    setCreateMealEditingItemIndex(index);
  }, []);

  const createMealTotals = useMemo(() => {
    let calories = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    createMealItems.forEach((it) => {
      calories += Number(it.calories) || 0;
      protein += Number(it.protein) || 0;
      carbs += Number(it.carbs) || 0;
      fat += Number(it.fat) || 0;
    });
    return { calories, protein, carbs, fat };
  }, [createMealItems]);

  const saveCreateMeal = useCallback(async () => {
    if (!userId || createMealItems.length === 0) return;
    const trimmed = createMealName.trim();
    const name = trimmed || 'Mi comida';
    setCreateMealSaving(true);
    try {
      await nutritionDb.createUserMeal(userId, { name, items: createMealItems });
      setCreateMealModalOpen(false);
      setCreateMealName('');
      setCreateMealItems([]);
      setCreateMealSelectedFood(null);
      loadUserMeals();
    } catch (e) {
      logger.error('[NutritionScreen] saveCreateMeal:', e);
    } finally {
      setCreateMealSaving(false);
    }
  }, [userId, createMealName, createMealItems, loadUserMeals]);

  const handleSaveCustomFood = useCallback(async () => {
    if (!userId) return;
    const nameRaw = createFoodName.trim();
    if (!nameRaw) return;
    const category = (createFoodCategory || '').trim() || null;
    const servingsPayload = createFoodServings.map((s, i) => ({
      serving_id: s.serving_id || String(i),
      serving_description: (s.serving_description || '').trim() || '1 porción',
      calories: Number(s.calories) || 0,
      protein: Number(s.protein) || 0,
      carbohydrate: Number(s.carbs) || 0,
      fat: Number(s.fat) || 0,
      metric_serving_amount: (s.grams_per_unit || '').trim() !== '' ? Number(s.grams_per_unit) : null,
    }));
    if (servingsPayload.length === 0) return;
    setCreateFoodSaving(true);
    try {
      if (editingSavedFood) {
        await nutritionDb.updateSavedFood(userId, editingSavedFood.id, {
          name: nameRaw,
          food_category: category,
          servings: servingsPayload,
        });
        const updated = {
          ...editingSavedFood,
          name: nameRaw,
          food_category: category,
          servings: servingsPayload,
        };
        setSavedFoods((prev) => prev.map((f) => (f.id === editingSavedFood.id ? updated : f)));
        setSelectedFood((prev) => (prev && prev.food_id === editingSavedFood.food_id ? { ...prev, food_name: nameRaw, food_category: category, servings: servingsPayload } : prev));
        setSelectedSavedFoodForEdit((prev) => (prev && prev.id === editingSavedFood.id ? updated : prev));
        setEditingSavedFood(null);
        setCreateFoodModalOpen(false);
      } else {
        const syntheticFoodId = `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const first = servingsPayload[0];
        const id = await nutritionDb.saveFood(userId, {
          food_id: syntheticFoodId,
          name: nameRaw,
          food_category: category,
          serving_id: first.serving_id,
          serving_description: first.serving_description,
          number_of_units: 1,
          calories_per_unit: first.calories,
          protein_per_unit: first.protein,
          carbs_per_unit: first.carbohydrate,
          fat_per_unit: first.fat,
          grams_per_unit: first.metric_serving_amount,
          servings: servingsPayload,
        });
        setSavedFoods((prev) => [
          {
            id,
            food_id: syntheticFoodId,
            name: nameRaw,
            food_category: category,
            serving_id: first.serving_id,
            serving_description: first.serving_description,
            number_of_units: 1,
            calories_per_unit: first.calories,
            protein_per_unit: first.protein,
            carbs_per_unit: first.carbohydrate,
            fat_per_unit: first.fat,
            grams_per_unit: first.metric_serving_amount,
            servings: servingsPayload,
          },
          ...prev,
        ]);
        setCreateFoodName('');
        setCreateFoodCategory('');
        setCreateFoodServings([
          { serving_id: '0', serving_description: '1 porción', grams_per_unit: '', calories: '', protein: '', carbs: '', fat: '' },
        ]);
        setCreateFoodModalOpen(false);
        setBuscarShowSaved(true);
      }
    } catch (e) {
      logger.error('[NutritionScreen] handleSaveCustomFood:', e);
    } finally {
      setCreateFoodSaving(false);
    }
  }, [
    userId,
    createFoodName,
    createFoodCategory,
    createFoodServings,
    editingSavedFood,
  ]);

  useEffect(() => {
    if (!createFoodModalOpen) return;
    if (editingSavedFood) {
      setCreateFoodName(editingSavedFood.name ?? '');
      setCreateFoodCategory(editingSavedFood.food_category ?? '');
      const serv = editingSavedFood.servings;
      if (Array.isArray(serv) && serv.length > 0) {
        setCreateFoodServings(serv.map((s) => ({
          serving_id: s.serving_id ?? String(serv.indexOf(s)),
          serving_description: s.serving_description ?? '1 porción',
          grams_per_unit: s.metric_serving_amount != null ? String(s.metric_serving_amount) : '',
          calories: s.calories != null ? String(s.calories) : '',
          protein: s.protein != null ? String(s.protein) : '',
          carbs: s.carbohydrate != null ? String(s.carbohydrate) : '',
          fat: s.fat != null ? String(s.fat) : '',
        })));
      } else {
        setCreateFoodServings([{
          serving_id: '0',
          serving_description: editingSavedFood.serving_description ?? '1 porción',
          grams_per_unit: editingSavedFood.grams_per_unit != null ? String(editingSavedFood.grams_per_unit) : '',
          calories: editingSavedFood.calories_per_unit != null ? String(editingSavedFood.calories_per_unit) : '',
          protein: editingSavedFood.protein_per_unit != null ? String(editingSavedFood.protein_per_unit) : '',
          carbs: editingSavedFood.carbs_per_unit != null ? String(editingSavedFood.carbs_per_unit) : '',
          fat: editingSavedFood.fat_per_unit != null ? String(editingSavedFood.fat_per_unit) : '',
        }]);
      }
    } else {
      setCreateFoodName('');
      setCreateFoodCategory('');
      setCreateFoodServings([
        { serving_id: '0', serving_description: '1 porción', grams_per_unit: '', calories: '', protein: '', carbs: '', fat: '' },
      ]);
    }
  }, [createFoodModalOpen, editingSavedFood]);

  useEffect(() => {
    if (!addModalVisible) {
      setBuscarQuery('');
      setBuscarResults([]);
      setBuscarLoading(false);
      setBuscarShowSaved(false);
      setBuscarSortBy('relevance');
      setBuscarFilterOpen(false);
      setSelectedFood(null);
      setBuscarServingIndex(0);
      setBuscarAmount('1');
      setMisComidasQuery('');
      setMisComidasSubTab('meals');
      setMisComidasAddChoiceOpen(false);
    }
  }, [addModalVisible]);

  const opcionesCardMargin = screenWidth * 0.08;
  const opcionesCardWidth = screenWidth - opcionesCardMargin * 2;
  const opcionesCardGap = 0;
  const opcionesCardStep = opcionesCardWidth + opcionesCardGap;
  const opcionesCardViewHeight = 540;

  const isInitialLoading = !userId || loading || !hasLoaded;

  if (isInitialLoading) {
    return (
      <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
        <FixedWakeHeader showBackButton onBackPress={() => navigate('/')} />
        <View style={styles.loadingFullScreen}>
          <WakeLoader />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader showBackButton onBackPress={() => navigate('/')} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <WakeHeaderContent style={styles.content}>
          <NutritionTopSpacer />
            <>
              <View style={styles.dateRow}>
                <WeekDateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} fetchDatesWithEntries={fetchDatesWithEntries} />
              </View>

              <View style={[styles.scrollContent, { minHeight: screenHeight }]}>
              {plan && (
                <>
                  <TouchableOpacity style={styles.topCard} onPress={toggleMacroMode} activeOpacity={0.8}>
                    <View style={styles.topCardLeft}>
                      {macroShowLeft ? (
                        <DroppedNumber
                          value={Math.round(left.calories)}
                          valueStyle={styles.caloriesLeftValue}
                        />
                      ) : (
                        <DroppedNumber
                          value={Math.round(consumed.calories)}
                          valueStyle={styles.caloriesLeftValue}
                          trailing={{
                            text: ' / ' + Math.round(planned.calories),
                            style: styles.caloriesLeftPlanned,
                          }}
                        />
                      )}
                      <View style={styles.labelCrossfadeWrap}>
                        <Animated.View style={[styles.labelCrossfadeInner, { opacity: faltanOpacity }]} pointerEvents="none">
                          <Text style={styles.caloriesLeftLabel}>Calorías faltan</Text>
                        </Animated.View>
                        <Animated.View style={[styles.labelCrossfadeInner, { opacity: llevasOpacity }]} pointerEvents="none">
                          <Text style={styles.caloriesLeftLabel}>Calorías llevas</Text>
                        </Animated.View>
                      </View>
                    </View>
                    <View style={styles.pieWrap}>
                      <ResponsiveContainer width="100%" height={140}>
                        <PieChart>
                          <Pie
                            data={caloriesPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={48}
                            outerRadius={58}
                            paddingAngle={1}
                            dataKey="value"
                            label={false}
                            stroke="none"
                          >
                            {caloriesPieData.map((_, i) => (
                              <Cell key={i} fill={_.fill} stroke="none" strokeWidth={0} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const name = payload[0].payload.name;
                              const value = Math.round(payload[0].value);
                              return (
                                <View style={styles.tooltip}>
                                  <Text style={styles.tooltipText}>{name}: {value} kcal</Text>
                                </View>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <View style={styles.pieIconCenter} pointerEvents="none">
                        <SvgFire width={32} height={32} stroke={ICON_WHITE} fill="none" />
                      </View>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.macroRow}>
                    {[
                      { key: 'protein', label: 'Proteína', planned: planned.protein, consumed: consumed.protein, left: left.protein, unit: 'g' },
                      { key: 'carbs', label: 'Carbs', planned: planned.carbs, consumed: consumed.carbs, left: left.carbs, unit: 'g' },
                      { key: 'fat', label: 'Grasa', planned: planned.fat, consumed: consumed.fat, left: left.fat, unit: 'g' },
                    ].map(({ key, label, planned: p, consumed: c, left: l, unit }) => {
                      const data = macroPie(c, p, key);
                      return (
                        <TouchableOpacity
                          key={key}
                          style={styles.macroCard}
                          onPress={toggleMacroMode}
                          activeOpacity={0.8}
                        >
                          <View style={styles.macroCardPie}>
                            <ResponsiveContainer width="100%" height={72}>
                              <PieChart>
                                <Pie
                                  data={data}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={24}
                                  outerRadius={30}
                                  paddingAngle={1}
                                  dataKey="value"
                                  label={false}
                                  stroke="none"
                                >
                                  {data.map((_, i) => (
                                    <Cell key={i} fill={_.fill} stroke="none" strokeWidth={0} />
                                  ))}
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                            <View style={styles.macroPieIconCenter} pointerEvents="none">
                              {key === 'protein' ? (
                                <Steak width={20} height={20} stroke={ICON_WHITE} fill="none" />
                              ) : key === 'carbs' ? (
                                <Wheat width={20} height={20} stroke={ICON_WHITE} />
                              ) : (
                                <Avocado width={20} height={20} fill={ICON_WHITE} />
                              )}
                            </View>
                          </View>
                          <View style={styles.macroCardText}>
                            {macroShowLeft ? (
                              <DroppedNumber
                                value={l.toFixed(0)}
                                suffix={unit}
                                valueStyle={styles.macroCardValue}
                              />
                            ) : (
                              <DroppedNumber
                                value={c.toFixed(0)}
                                valueStyle={styles.macroCardValue}
                                trailing={{
                                  text: '/' + p.toFixed(0) + unit,
                                  style: styles.macroCardPlanned,
                                }}
                              />
                            )}
                            <View style={styles.labelCrossfadeWrap}>
                              <Animated.View style={[styles.labelCrossfadeInner, { opacity: faltanOpacity }]} pointerEvents="none">
                                <Text style={styles.macroCardLabel}>{label} faltan</Text>
                              </Animated.View>
                              <Animated.View style={[styles.labelCrossfadeInner, { opacity: llevasOpacity }]} pointerEvents="none">
                                <Text style={styles.macroCardLabel}>{label} llevas</Text>
                              </Animated.View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {categoriesWithFood.length > 0 && (
                    <View style={styles.categoriesSection}>
                      {categoriesWithFood.map((cat, idx) => {
                        const mealId = getMealIdForCategory(cat);
                        const mealEntries = diaryByMeal[mealId] ?? [];
                        const mealTotals = sumDiary(mealEntries);
                        return (
                          <View key={`category-${idx}-${cat.label ?? ''}`} style={styles.categoryBlock}>
                            <Text style={styles.mealSectionTitle}>{cat.label ?? 'Sin nombre'}</Text>
                            {mealEntries.length > 0 && (
                              <Text style={styles.mealMacroSummary}>
                                {`${Math.round(mealTotals.calories)} kcal  ·  ${Math.round(mealTotals.protein)}g P  ·  ${Math.round(mealTotals.carbs)}g C  ·  ${Math.round(mealTotals.fat)}g G`}
                              </Text>
                            )}
                            {mealEntries.map((entry) => {
                              const serving = formatDiaryServing(entry);
                              return (
                                <View key={entry.id} style={styles.diaryItemRow}>
                                  <TouchableOpacity
                                    style={styles.diaryItemContent}
                                    onPress={() => handleEditDiaryEntry(entry)}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.diaryItemEmoji} selectable={false}>{getFoodEmoji(entry)}</Text>
                                    <Text style={styles.diaryItemName} numberOfLines={2}>{entry.name ?? 'Alimento'}</Text>
                                    {serving && (
                                      <View style={styles.diaryItemRight}>
                                        <Text style={styles.diaryItemAmount}>{serving.main}</Text>
                                        {serving.sub && (
                                          <Text style={styles.diaryItemSub}>{serving.sub}</Text>
                                        )}
                                      </View>
                                    )}
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.diaryItemMenuBtn}
                                    onPress={(e) => {
                                      setMenuAnchor({ pageY: e.nativeEvent.pageY });
                                      setMenuEntryId(entry.id);
                                    }}
                                    activeOpacity={0.7}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    <Text style={styles.diaryItemMenuIcon}>⋮</Text>
                                  </TouchableOpacity>
                                </View>
                              );
                            })}
                            <TouchableOpacity
                              style={styles.mealAddButton}
                              onPress={() => {
                                setAddModalCategoryIndex(idx);
                                setAddModalCategoryDropdownOpen(false);
                                setAddModalTab('opciones');
                                handleAddModalOpen();
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.mealAddButtonText}>+ Añadir</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </>
              )}

              {!plan && hasLoaded && !loading && (
                <View style={styles.noPlan}>
                  <Text style={styles.noPlanText}>No tienes un plan de nutrición asignado.</Text>
                </View>
              )}

              <View style={styles.fatsecretAttributionWeb}>
                <Text style={styles.fatsecretAttributionText}>Powered by fatsecret</Text>
              </View>
              </View>
            </>
        </WakeHeaderContent>
        <BottomSpacer />
      </ScrollView>

      <WakeModalOverlay
        visible={addModalVisible}
        onClose={handleAddModalClose}
        contentPlacement="full"
        contentAnimation="fade"
        closeOnBackdropClick={false}
      >
        <Animated.View
          style={[
            styles.addModalOverlay,
            {
              opacity: addModalSlideAnim,
              transform: [
                {
                  translateY: addModalSlideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [60, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.addModalContent}>
            <View style={styles.addModalHeader}>
              <View style={styles.addModalTitleRow}>
                <TouchableOpacity
                  style={styles.addModalCategoryPicker}
                  onPress={() => setAddModalCategoryDropdownOpen((v) => !v)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addModalTitle} numberOfLines={1}>
                    {effectiveCategories[selectedCategoryIndex]?.label ?? 'Sin nombre'}
                  </Text>
                  <View style={[styles.addModalChevronWrap, addModalCategoryDropdownOpen && styles.addModalChevronWrapOpen]}>
                    <SvgChevronDown width={20} height={20} stroke="rgba(255,255,255,0.9)" />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addModalCloseBtn}
                  onPress={handleAddModalClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addModalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              {addModalCategoryDropdownOpen && effectiveCategories.length > 0 && (
                <View style={styles.addModalCategoryDropdown}>
                  {effectiveCategories.map((cat, i) => (
                    <TouchableOpacity
                      key={`cat-${i}-${cat.label ?? ''}`}
                      style={[
                        styles.addModalCategoryDropdownItem,
                        i === selectedCategoryIndex && styles.addModalCategoryDropdownItemActive,
                        i === effectiveCategories.length - 1 && styles.addModalCategoryDropdownItemLast,
                      ]}
                      onPress={() => {
                        setAddModalCategoryIndex(i);
                        setAddModalCategoryDropdownOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.addModalCategoryDropdownItemText}>{cat.label ?? 'Sin nombre'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <View style={styles.addModalTabBar}>
              <View style={styles.addModalTabHeaderContainer}>
                <View
                  style={[
                    styles.addModalTabIndicator,
                    {
                      width: '33.33%',
                      left:
                        addModalTab === 'opciones'
                          ? '0%'
                          : addModalTab === 'buscar'
                            ? '33.33%'
                            : '66.66%',
                    },
                  ]}
                />
                {[
                  { key: 'opciones', title: 'Opciones' },
                  { key: 'buscar', title: 'Buscar' },
                  { key: 'mis_comidas', title: 'Mis comidas' },
                ].map((tab) => (
                  <TouchableOpacity
                    key={tab.key}
                    style={styles.addModalTabButton}
                    activeOpacity={0.7}
                    onPress={() => setAddModalTab(tab.key)}
                  >
                    <Text
                      style={[
                        styles.addModalTabTitle,
                        addModalTab !== tab.key && styles.addModalTabTitleInactive,
                      ]}
                    >
                      {tab.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.addModalBody}>
              {addModalTab === 'buscar' && (
                <View style={styles.buscarSection}>
                  <View style={styles.buscarSearchWrap}>
                    <View style={styles.buscarSearchRow}>
                      <TextInput
                        style={styles.buscarSearchInput}
                        value={buscarQuery}
                        onChangeText={setBuscarQuery}
                        placeholder="Buscar alimento…"
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        onSubmitEditing={handleBuscarSearch}
                        returnKeyType="search"
                      />
                      <TouchableOpacity
                        style={[
                          styles.buscarFilterToggle,
                          barcodeModalOpen && styles.buscarFilterToggleActive,
                        ]}
                        onPress={() => {
                          setBarcodeError('');
                          if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                            setBarcodeModalOpen(true);
                            return;
                          }
                          setBarcodeCameraOpen(true);
                        }}
                        activeOpacity={0.8}
                      >
                        <SvgBarcodeFile
                          width={26}
                          height={26}
                          fill={barcodeModalOpen ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)'}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.buscarSavedToggle, buscarShowSaved && styles.buscarSavedToggleActive]}
                        onPress={() => {
                          setBuscarShowSaved((v) => !v);
                          setBuscarFilterOpen(false);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.buscarSavedToggleIcon,
                            buscarShowSaved && styles.buscarSavedToggleIconActive,
                          ]}
                        >
                          {buscarShowSaved ? '★' : '☆'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {buscarFilterOpen && (
                      <View style={styles.buscarFilterPanel}>
                        <Text style={styles.buscarFilterPanelTitle}>Ordenar por</Text>
                        {[
                          { key: 'relevance', label: 'Relevancia' },
                          { key: 'cal_asc', label: 'Calorías ↑' },
                          { key: 'cal_desc', label: 'Calorías ↓' },
                          { key: 'protein_desc', label: 'Proteína ↓' },
                          { key: 'name_asc', label: 'Nombre A–Z' },
                        ].map((opt) => (
                          <TouchableOpacity
                            key={opt.key}
                            style={[
                              styles.buscarFilterOption,
                              buscarSortBy === opt.key && styles.buscarFilterOptionActive,
                            ]}
                            onPress={() => {
                              setBuscarSortBy(opt.key);
                              setBuscarFilterOpen(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.buscarFilterOptionText,
                                buscarSortBy === opt.key && styles.buscarFilterOptionTextActive,
                              ]}
                            >
                              {opt.label}
                            </Text>
                            {buscarSortBy === opt.key && (
                              <Text style={styles.buscarFilterOptionCheck}>✓</Text>
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {!buscarShowSaved &&
                      !buscarFilterOpen &&
                      buscarQuery.trim().length > 0 && (
                        <TouchableOpacity
                          style={styles.buscarSearchBtn}
                          onPress={handleBuscarSearch}
                          disabled={buscarLoading}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.buscarSearchBtnText}>
                            {buscarLoading ? 'Buscando…' : 'Buscar en base de datos'}
                          </Text>
                        </TouchableOpacity>
                      )}

                    {!buscarFilterOpen && (
                      <ScrollView
                        style={styles.buscarResultsList}
                        showsVerticalScrollIndicator={false}
                      >
                        {buscarShowSaved ? (
                          sortedSavedFoods.length === 0 ? (
                            <View style={styles.buscarEmptyState}>
                              <Text style={styles.buscarEmptyText}>
                                No tienes alimentos guardados.{'\n'}Guarda uno con ☆ al
                                verlo.
                              </Text>
                              <TouchableOpacity
                                style={[styles.crearComidaBtn, { marginTop: 16 }]}
                                onPress={() => { setEditingSavedFood(null); setCreateFoodModalOpen(true); }}
                                activeOpacity={0.8}
                              >
                                <Text style={styles.crearComidaBtnText}>
                                  Crear alimento manual
                                </Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <>
                              <View style={styles.misComidasHeader}>
                                <TouchableOpacity
                                  style={styles.crearComidaBtn}
                                  onPress={() => { setEditingSavedFood(null); setCreateFoodModalOpen(true); }}
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.crearComidaBtnText}>
                                    Crear alimento manual
                                  </Text>
                                </TouchableOpacity>
                              </View>
                              {sortedSavedFoods.map((sf) => {
                              const gpu = sf.grams_per_unit;
                              let macroMeta;
                              if (gpu && gpu > 0) {
                                const s = 100 / gpu;
                                macroMeta = `${Math.round(
                                  (sf.calories_per_unit || 0) * s,
                                )} kcal · ${
                                  Math.round((sf.protein_per_unit || 0) * s * 10) / 10
                                }g P · ${
                                  Math.round((sf.carbs_per_unit || 0) * s * 10) / 10
                                }g C · ${
                                  Math.round((sf.fat_per_unit || 0) * s * 10) / 10
                                }g G`;
                              } else {
                                macroMeta = `${Math.round(
                                  sf.calories_per_unit || 0,
                                )} kcal · ${
                                  Math.round((sf.protein_per_unit || 0) * 10) / 10
                                }g P · ${
                                  Math.round((sf.carbs_per_unit || 0) * 10) / 10
                                }g C · ${
                                  Math.round((sf.fat_per_unit || 0) * 10) / 10
                                }g G`;
                              }
                              return (
                                <TouchableOpacity
                                  key={sf.id}
                                  style={styles.buscarResultItem}
                                  onPress={() => handleSelectSavedFood(sf)}
                                  activeOpacity={0.8}
                                >
                                  <View style={styles.buscarResultInfo}>
                                    <Text
                                      style={styles.buscarResultName}
                                      numberOfLines={1}
                                    >
                                      {sf.name}
                                    </Text>
                                    <Text
                                      style={styles.buscarResultMeta}
                                      numberOfLines={1}
                                    >
                                      {macroMeta}
                                    </Text>
                                  </View>
                                  <TouchableOpacity
                                    style={styles.buscarResultAddBtn}
                                    onPress={() => handleSelectSavedFood(sf)}
                                    activeOpacity={0.8}
                                  >
                                    <Text style={styles.buscarResultAddBtnText}>+</Text>
                                  </TouchableOpacity>
                                </TouchableOpacity>
                              );
                            })}
                            </>
                          )
                        ) : sortedBuscarResults.length === 0 ? (
                          buscarLoading ? (
                            <View style={styles.buscarEmptyState}>
                              <WakeLoader size={48} />
                            </View>
                          ) : buscarQuery.trim() ? (
                            <View style={styles.buscarEmptyState}>
                              <Text style={styles.buscarEmptyText}>Sin resultados.</Text>
                            </View>
                          ) : buscarHistory.length > 0 ? (
                            <>
                              <Text style={styles.buscarHistoryLabel}>Recientes</Text>
                              {buscarHistory.map((item) => (
                                <TouchableOpacity
                                  key={item.food_id}
                                  style={styles.buscarResultItem}
                                  onPress={() =>
                                    handleSelectFood({
                                      food_id: item.food_id,
                                      food_name: item.food_name,
                                      food_category: item.food_category ?? null,
                                      servings: { serving: [] },
                                    })
                                  }
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.buscarHistoryIcon}>↺</Text>
                                  <View style={styles.buscarResultInfo}>
                                    <Text
                                      style={styles.buscarResultName}
                                      numberOfLines={1}
                                    >
                                      {item.food_name}
                                    </Text>
                                  </View>
                                  <TouchableOpacity
                                    style={styles.buscarResultAddBtn}
                                    onPress={() =>
                                      handleSelectFood({
                                        food_id: item.food_id,
                                        food_name: item.food_name,
                                        food_category: item.food_category ?? null,
                                        servings: { serving: [] },
                                      })
                                    }
                                    activeOpacity={0.8}
                                  >
                                    <Text style={styles.buscarResultAddBtnText}>+</Text>
                                  </TouchableOpacity>
                                </TouchableOpacity>
                              ))}
                            </>
                          ) : (
                            <View style={styles.buscarEmptyState}>
                              <Text style={styles.buscarEmptyText}>
                                Busca un alimento para empezar.
                              </Text>
                            </View>
                          )
                        ) : (
                          sortedBuscarResults.map((food) => {
                            const per100 = getPer100g(food);
                            const macroMeta = per100
                              ? `${per100.calories} kcal · ${per100.protein}g P · ${per100.carbs}g C · ${per100.fat}g G`
                              : '—';
                            return (
                              <TouchableOpacity
                                key={food.food_id}
                                style={styles.buscarResultItem}
                                onPress={() => handleSelectFood(food)}
                                activeOpacity={0.8}
                              >
                                <View style={styles.buscarResultInfo}>
                                  <Text
                                    style={styles.buscarResultName}
                                    numberOfLines={1}
                                  >
                                    {food.food_name}
                                  </Text>
                                  <Text
                                    style={styles.buscarResultMeta}
                                    numberOfLines={1}
                                  >
                                    {macroMeta}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  style={styles.buscarResultAddBtn}
                                  onPress={() => handleSelectFood(food)}
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.buscarResultAddBtnText}>+</Text>
                                </TouchableOpacity>
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </ScrollView>
                    )}
                  </View>
                </View>
              )}

              {addModalTab === 'opciones' && (
                <View style={styles.addModalPage}>
                  <View style={styles.opcionesSection}>
                    <View
                      style={[
                        styles.opcionesCarouselAndPagination,
                        { marginHorizontal: -20, width: screenWidth },
                      ]}
                    >
                      <Animated.ScrollView
                        ref={opcionesScrollRef}
                        horizontal
                        pagingEnabled={false}
                        snapToInterval={opcionesCardStep}
                        snapToAlignment="start"
                        decelerationRate="fast"
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={[
                          styles.opcionesCarouselContent,
                          {
                            paddingLeft: opcionesCardMargin,
                            paddingRight: opcionesCardMargin,
                            minHeight: opcionesCardViewHeight,
                          },
                        ]}
                        style={[
                          styles.opcionesCarousel,
                          { minHeight: opcionesCardViewHeight },
                        ]}
                        onScroll={Animated.event(
                          [{ nativeEvent: { contentOffset: { x: opcionesScrollX } } }],
                          { useNativeDriver: false },
                        )}
                        onMomentumScrollEnd={(e) => {
                          const x = e.nativeEvent.contentOffset.x;
                          const idx = Math.round(x / opcionesCardStep);
                          setOpcionesCardIndex(
                            Math.min(idx, Math.max(0, opcionesOptions.length - 1)),
                          );
                        }}
                        onScrollEndDrag={(e) => {
                          const x = e.nativeEvent.contentOffset.x;
                          const idx = Math.round(x / opcionesCardStep);
                          setOpcionesCardIndex(
                            Math.min(idx, Math.max(0, opcionesOptions.length - 1)),
                          );
                        }}
                      >
                        {opcionesOptions.length === 0 ? (
                          <View
                            style={{
                              width: opcionesCardWidth,
                              flex: 1,
                              minHeight: opcionesCardViewHeight,
                            }}
                          >
                            <NoOpcionesEmptyCard />
                          </View>
                        ) : (
                          opcionesOptions.map((opt, idx) => {
                            const items = opt.items ?? opt.foods ?? [];
                            const macros = optionMacros(opt);
                            const categoryLabel =
                              effectiveCategories[selectedCategoryIndex]?.label ??
                              'comida';
                            const isRecipe = !!(
                              opt.recipe_name || opt.recipe_video_url
                            );
                            const optionTitle =
                              opt.recipe_name ??
                              opt.label ??
                              opt.name ??
                              `Opción ${idx + 1}`;
                            const selectedSet = opcionesSelectedByCard[idx] ?? [];
                            const selectedCount = selectedSet.length;
                            const toggleItem = (itemIndex) => {
                              setOpcionesSelectedByCard((prev) => {
                                const arr = prev[idx] ?? [];
                                const set = new Set(arr);
                                if (set.has(itemIndex)) set.delete(itemIndex);
                                else set.add(itemIndex);
                                return { ...prev, [idx]: Array.from(set) };
                              });
                            };
                            const inputRange = [
                              (idx - 1) * opcionesCardStep,
                              idx * opcionesCardStep,
                              (idx + 1) * opcionesCardStep,
                            ];
                            const scale = opcionesScrollX.interpolate({
                              inputRange,
                              outputRange: [0.85, 1.0, 0.85],
                              extrapolate: 'clamp',
                            });
                            const opacity = opcionesScrollX.interpolate({
                              inputRange,
                              outputRange: [0.5, 1.0, 0.5],
                              extrapolate: 'clamp',
                            });
                            return (
                              <Animated.View
                                key={`opt-${idx}`}
                                style={[
                                  styles.opcionesCard,
                                  {
                                    width: opcionesCardWidth,
                                    marginRight:
                                      idx < opcionesOptions.length - 1
                                        ? opcionesCardGap
                                        : 0,
                                  },
                                  { opacity, transform: [{ scale }] },
                                ]}
                              >
                                {items.length === 0 ? (
                                  <View
                                    style={[
                                      styles.noOpcionesOptionCardWrap,
                                      { minHeight: opcionesCardViewHeight },
                                    ]}
                                  >
                                    <NoOpcionesEmptyCard />
                                  </View>
                                ) : (
                                  <>
                                    {opt.recipe_video_url ? (
                                      <TouchableOpacity
                                        style={[
                                          styles.mealBanner,
                                          {
                                            backgroundColor:
                                              MEAL_BANNER_COLORS[
                                                (selectedCategoryIndex * 31 +
                                                  idx * 7 +
                                                  13) %
                                                  MEAL_BANNER_COLORS.length
                                              ],
                                          },
                                        ]}
                                        onPress={() =>
                                          setRecipeVideoModalUrl(
                                            opt.recipe_video_url,
                                          )
                                        }
                                        activeOpacity={0.9}
                                      >
                                        <View style={styles.recipeVideoPlayWrap}>
                                          <View
                                            style={styles.recipeVideoPlayCircle}
                                          >
                                            <Text style={styles.recipeVideoPlayIcon}>
                                              ▶
                                            </Text>
                                          </View>
                                          <Text style={styles.recipeVideoPlayLabel}>
                                            Ver vídeo
                                          </Text>
                                        </View>
                                      </TouchableOpacity>
                                    ) : (
                                      <MealImageBanner
                                        items={items}
                                        colorIndex={idx}
                                        categoryIndex={selectedCategoryIndex}
                                      />
                                    )}
                                    <View style={styles.opcionesCardInner}>
                                      <View style={styles.opcionesCardHeader}>
                                        {isRecipe && (
                                          <Text
                                            style={styles.opcionesCardTitle}
                                            numberOfLines={1}
                                          >
                                            {optionTitle}
                                          </Text>
                                        )}
                                        <Text style={styles.opcionesCardMacroLine}>
                                          {`${Math.round(
                                            macros.calories,
                                          )} kcal  ·  ${Math.round(
                                            macros.protein,
                                          )}g Prot  ·  ${Math.round(
                                            macros.carbs,
                                          )}g C  ·  ${Math.round(
                                            macros.fat,
                                          )}g G`}
                                        </Text>
                                      </View>
                                      <View style={styles.opcionesCardIngredients}>
                                        {items.map((it, i) => {
                                          const selected = selectedSet.includes(i);
                                          const right = formatIngredientRight(it);
                                          return (
                                            <TouchableOpacity
                                              key={i}
                                              style={styles.opcionesCardIngredientRow}
                                              onPress={() => toggleItem(i)}
                                              activeOpacity={0.7}
                                            >
                                              <Text
                                                style={styles.opcionesCardIngredientName}
                                                numberOfLines={1}
                                              >
                                                {getFoodEmoji(it)}{'  '}
                                                {it.name ?? 'Alimento'}
                                              </Text>
                                              <View
                                                style={
                                                  styles.opcionesCardIngredientRight
                                                }
                                              >
                                                <View
                                                  style={
                                                    styles.opcionesCardIngredientAmountBlock
                                                  }
                                                >
                                                  <Text
                                                    style={
                                                      styles.opcionesCardIngredientAmount
                                                    }
                                                    numberOfLines={1}
                                                  >
                                                    {right.main}
                                                  </Text>
                                                  {right.sub != null && (
                                                    <Text
                                                      style={
                                                        styles.opcionesCardIngredientAmountSub
                                                      }
                                                      numberOfLines={1}
                                                    >
                                                      {right.sub}
                                                    </Text>
                                                  )}
                                                </View>
                                                <View
                                                  style={[
                                                    styles.opcionesCardCheckbox,
                                                    selected &&
                                                      styles.opcionesCardCheckboxChecked,
                                                  ]}
                                                >
                                                  {selected && (
                                                    <Text
                                                      style={
                                                        styles.opcionesCardCheckboxCheck
                                                      }
                                                    >
                                                      ✓
                                                    </Text>
                                                  )}
                                                </View>
                                              </View>
                                            </TouchableOpacity>
                                          );
                                        })}
                                      </View>
                                      <TouchableOpacity
                                        style={[
                                          styles.opcionesCardAddBtn,
                                          (addOptionLoading || selectedCount === 0) &&
                                            styles.opcionesCardAddBtnDisabled,
                                        ]}
                                        activeOpacity={0.8}
                                        onPress={() =>
                                          handleAddOptionToMeal(
                                            opt,
                                            selectedCategory,
                                            selectedSet,
                                          )
                                        }
                                        disabled={addOptionLoading || selectedCount === 0}
                                      >
                                        <Text
                                          style={[
                                            styles.opcionesCardAddBtnText,
                                            selectedCount === 0 &&
                                              styles.opcionesCardAddBtnTextDisabled,
                                          ]}
                                        >
                                          {addOptionLoading
                                            ? 'Añadiendo…'
                                            : `Añadir a ${categoryLabel}`}
                                        </Text>
                                      </TouchableOpacity>
                                    </View>
                                  </>
                                )}
                              </Animated.View>
                            );
                          })
                        )}
                      </Animated.ScrollView>
                      {opcionesOptions.length > 0 && (
                        <View style={styles.opcionesPaginationContainer}>
                          <View style={styles.opcionesPaginationDots}>
                            {opcionesOptions.map((_, index) => {
                              const inputRange = [
                                (index - 1) * opcionesCardStep,
                                index * opcionesCardStep,
                                (index + 1) * opcionesCardStep,
                              ];
                              const opacity = opcionesScrollX.interpolate({
                                inputRange,
                                outputRange: [0.3, 1.0, 0.3],
                                extrapolate: 'clamp',
                              });
                              const scale = opcionesScrollX.interpolate({
                                inputRange,
                                outputRange: [0.8, 1.3, 0.8],
                                extrapolate: 'clamp',
                              });
                              return (
                                <Animated.View
                                  key={index}
                                  style={[
                                    styles.opcionesPaginationDot,
                                    { opacity, transform: [{ scale }] },
                                  ]}
                                />
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              )}

              {addModalTab === 'mis_comidas' && (
                <View style={styles.addModalPage}>
                  <View style={styles.misComidasSearchRow}>
                    <TextInput
                      style={styles.misComidasSearchInput}
                      value={misComidasQuery}
                      onChangeText={setMisComidasQuery}
                      placeholder="Buscar en mis comidas y alimentos…"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />
                    <TouchableOpacity
                      style={styles.misComidasPlusBtn}
                      onPress={() => setMisComidasAddChoiceOpen(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.misComidasPlusBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.misComidasSubTabBar}>
                    <TouchableOpacity
                      style={[
                        styles.misComidasSubTabBtn,
                        misComidasSubTab === 'meals' && styles.misComidasSubTabBtnActive,
                      ]}
                      onPress={() => setMisComidasSubTab('meals')}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.misComidasSubTabText,
                          misComidasSubTab === 'meals' && styles.misComidasSubTabTextActive,
                        ]}
                      >
                        Comidas
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.misComidasSubTabBtn,
                        misComidasSubTab === 'foods' && styles.misComidasSubTabBtnActive,
                      ]}
                      onPress={() => setMisComidasSubTab('foods')}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.misComidasSubTabText,
                          misComidasSubTab === 'foods' && styles.misComidasSubTabTextActive,
                        ]}
                      >
                        Alimentos
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    style={styles.misComidasScroll}
                    contentContainerStyle={styles.misComidasScrollContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {misComidasSubTab === 'meals' && (
                    <View style={styles.misComidasSection}>
                      {userMealsLoading ? (
                        <View style={styles.misComidasLoading}>
                          <WakeLoader size={40} />
                        </View>
                      ) : misComidasFilteredMeals.length === 0 ? (
                        <View style={styles.misComidasEmpty}>
                          <Text style={styles.misComidasEmptyText}>
                            {misComidasQuery.trim()
                              ? 'No hay comidas que coincidan.'
                              : 'Aún no tienes comidas guardadas.'}
                          </Text>
                          {!misComidasQuery.trim() && (
                            <Text style={styles.misComidasEmptySub}>
                              Crea una comida combinando varios alimentos.
                            </Text>
                          )}
                        </View>
                      ) : (
                        <View style={styles.misComidasList}>
                          {misComidasFilteredMeals.map((meal) => {
                            const macros = optionMacros({ items: meal.items ?? [] });
                            const items = meal.items ?? [];
                            const selectedSet = misComidasSelectedByCard[meal.id] ?? [];
                            const toggleItem = (index) => {
                              setMisComidasSelectedByCard((prev) => {
                                const arr = prev[meal.id] ?? [];
                                const set = new Set(arr);
                                if (set.has(index)) set.delete(index);
                                else set.add(index);
                                return { ...prev, [meal.id]: Array.from(set) };
                              });
                            };
                            const selectedCount =
                              (Array.isArray(selectedSet) && selectedSet.length) || items.length;
                            const canAdd = items.length > 0;
                            return (
                              <View key={meal.id} style={[styles.opcionesCard, styles.misComidasCard]}>
                                <View style={styles.opcionesCardInner}>
                                  <View style={styles.opcionesCardHeader}>
                                    <Text style={styles.opcionesCardTitle} numberOfLines={1}>
                                      {meal.name || 'Comida'}
                                    </Text>
                                    <Text style={styles.opcionesCardMacroLine}>
                                      {`${Math.round(macros.calories)} kcal  ·  ${Math.round(
                                        macros.protein
                                      )}g P  ·  ${Math.round(
                                        macros.carbs
                                      )}g C  ·  ${Math.round(macros.fat)}g G`}
                                    </Text>
                                  </View>
                                  <View style={styles.opcionesCardIngredients}>
                                    {items.map((it, index) => {
                                      const selected = selectedSet.includes(index);
                                      const right = formatIngredientRight(it);
                                      return (
                                        <TouchableOpacity
                                          key={`${meal.id}-${index}`}
                                          style={styles.opcionesCardIngredientRow}
                                          onPress={() => toggleItem(index)}
                                          activeOpacity={0.7}
                                        >
                                          <Text
                                            style={styles.opcionesCardIngredientName}
                                            numberOfLines={1}
                                          >
                                            {getFoodEmoji(it)}{'  '}
                                            {it.name ?? 'Alimento'}
                                          </Text>
                                          <View style={styles.opcionesCardIngredientRight}>
                                            <View style={styles.opcionesCardIngredientAmountBlock}>
                                              <Text
                                                style={styles.opcionesCardIngredientAmount}
                                                numberOfLines={1}
                                              >
                                                {right.main}
                                              </Text>
                                              {right.sub != null && (
                                                <Text
                                                  style={styles.opcionesCardIngredientAmountSub}
                                                  numberOfLines={1}
                                                >
                                                  {right.sub}
                                                </Text>
                                              )}
                                            </View>
                                            <View
                                              style={[
                                                styles.opcionesCardCheckbox,
                                                selected && styles.opcionesCardCheckboxChecked,
                                              ]}
                                            >
                                              {selected && (
                                                <Text style={styles.opcionesCardCheckboxCheck}>✓</Text>
                                              )}
                                            </View>
                                          </View>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                  <TouchableOpacity
                                    style={[
                                      styles.opcionesCardAddBtn,
                                      (!canAdd || addOptionLoading) &&
                                        styles.opcionesCardAddBtnDisabled,
                                    ]}
                                    activeOpacity={0.8}
                                    onPress={() => handleAddUserMealToDiary(meal, selectedCategory)}
                                    disabled={!canAdd || addOptionLoading}
                                  >
                                    <Text
                                      style={[
                                        styles.opcionesCardAddBtnText,
                                        (!canAdd || addOptionLoading) &&
                                          styles.opcionesCardAddBtnTextDisabled,
                                      ]}
                                    >
                                      {addOptionLoading
                                        ? 'Añadiendo…'
                                        : selectedCount === items.length
                                          ? 'Añadir al diario'
                                          : 'Añadir seleccionados'}
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                    )}
                    {misComidasSubTab === 'foods' && (
                    <View style={styles.misComidasSection}>
                      {misComidasFilteredFoods.length === 0 ? (
                        <View style={styles.misComidasEmpty}>
                          <Text style={styles.misComidasEmptyText}>
                            {misComidasQuery.trim()
                              ? 'No hay alimentos que coincidan.'
                              : 'No tienes alimentos guardados.'}
                          </Text>
                          {!misComidasQuery.trim() && (
                            <Text style={styles.misComidasEmptySub}>
                              Crea un alimento con macros para usarlo en comidas o en el diario.
                            </Text>
                          )}
                        </View>
                      ) : (
                        <View style={styles.misComidasFoodList}>
                          {misComidasFilteredFoods.map((sf) => {
                            const gpu = sf.grams_per_unit;
                            let macroMeta;
                            if (gpu && gpu > 0) {
                              const s = 100 / gpu;
                              macroMeta = `${Math.round(
                                (sf.calories_per_unit || 0) * s,
                              )} kcal · ${
                                Math.round((sf.protein_per_unit || 0) * s * 10) / 10
                              }g P · ${
                                Math.round((sf.carbs_per_unit || 0) * s * 10) / 10
                              }g C · ${
                                Math.round((sf.fat_per_unit || 0) * s * 10) / 10
                              }g G`;
                            } else {
                              macroMeta = `${Math.round(
                                sf.calories_per_unit || 0,
                              )} kcal · ${
                                Math.round((sf.protein_per_unit || 0) * 10) / 10
                              }g P · ${
                                Math.round((sf.carbs_per_unit || 0) * 10) / 10
                              }g C · ${
                                Math.round((sf.fat_per_unit || 0) * 10) / 10
                              }g G`;
                            }
                            return (
                              <TouchableOpacity
                                key={sf.id}
                                style={styles.buscarResultItem}
                                onPress={() => handleSelectSavedFood(sf)}
                                activeOpacity={0.8}
                              >
                                <View style={styles.buscarResultInfo}>
                                  <Text
                                    style={styles.buscarResultName}
                                    numberOfLines={1}
                                  >
                                    {sf.name}
                                  </Text>
                                  <Text
                                    style={styles.buscarResultMeta}
                                    numberOfLines={1}
                                  >
                                    {macroMeta}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  style={styles.buscarResultAddBtn}
                                  onPress={() => handleSelectSavedFood(sf)}
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.buscarResultAddBtnText}>+</Text>
                                </TouchableOpacity>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
        </Animated.View>
      </WakeModalOverlay>

      <WakeModalOverlay
        visible={misComidasAddChoiceOpen && addModalVisible && addModalTab === 'mis_comidas'}
        onClose={() => setMisComidasAddChoiceOpen(false)}
        contentPlacement="center"
        contentAnimation="fade"
        closeOnBackdropClick
      >
        <View style={styles.misComidasAddChoiceCard}>
          <Text style={styles.misComidasAddChoiceTitle}>¿Qué quieres crear?</Text>
          <View style={styles.misComidasAddChoiceButtons}>
            <TouchableOpacity
              style={styles.misComidasAddChoiceBtn}
              onPress={() => {
                setMisComidasAddChoiceOpen(false);
                setCreateMealModalOpen(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.misComidasAddChoiceBtnText}>Crear comida</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.misComidasAddChoiceBtn}
              onPress={() => {
                setMisComidasAddChoiceOpen(false);
                setEditingSavedFood(null);
                setCreateFoodModalOpen(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.misComidasAddChoiceBtnText}>Crear alimento</Text>
            </TouchableOpacity>
          </View>
        </View>
      </WakeModalOverlay>

      <WakeModalOverlay
        visible={createMealModalOpen}
        onClose={handleCreateMealClose}
        contentPlacement="full"
        contentAnimation="fade"
      >
        <View style={styles.fdScreen}>
          <View style={styles.fdHeader}>
            <TouchableOpacity style={styles.fdBackBtn} onPress={handleCreateMealClose} activeOpacity={0.7}>
              <Text style={styles.fdBackBtnText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.fdHeaderTitle}>Crear comida</Text>
            <View style={styles.fdHeaderRight} />
          </View>

          <ScrollView
            style={styles.fdScroll}
            contentContainerStyle={styles.fdScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.fdNameRow}>
              <TextInput
                style={[styles.fdName, { paddingVertical: 4, paddingRight: 0 }]}
                value={createMealName}
                onChangeText={setCreateMealName}
                placeholder="Nombre de la comida (opcional)"
                placeholderTextColor="rgba(255,255,255,0.35)"
              />
              <View style={{ width: 38 }} />
            </View>

            <View style={styles.createMealTotalsCard}>
              <View style={styles.fdCalCard}>
                <SvgFire width={28} height={28} stroke={ICON_WHITE} fill="none" />
                <View style={styles.fdCalTexts}>
                  <Text style={styles.fdCalLabel}>Calorías</Text>
                  <Text style={styles.fdCalValue}>{createMealTotals.calories}</Text>
                </View>
              </View>
              <View style={styles.fdMacroRow}>
                <View style={styles.fdMacroCard}>
                  <Steak width={18} height={18} stroke={ICON_WHITE} fill="none" />
                  <Text style={styles.fdMacroLabel}>Proteína</Text>
                  <Text style={styles.fdMacroValue}>{createMealTotals.protein.toFixed(0)}g</Text>
                </View>
                <View style={styles.fdMacroCard}>
                  <Wheat width={18} height={18} stroke={ICON_WHITE} />
                  <Text style={styles.fdMacroLabel}>Carbos</Text>
                  <Text style={styles.fdMacroValue}>{createMealTotals.carbs.toFixed(0)}g</Text>
                </View>
                <View style={styles.fdMacroCard}>
                  <Avocado width={18} height={18} fill={ICON_WHITE} />
                  <Text style={styles.fdMacroLabel}>Grasa</Text>
                  <Text style={styles.fdMacroValue}>{createMealTotals.fat.toFixed(0)}g</Text>
                </View>
              </View>
            </View>

            <Text style={styles.fdSectionLabel}>Ingredientes</Text>
            <TouchableOpacity
              style={styles.createMealAddIngredientBtn}
              onPress={() => {
                setCreateMealSearchQuery('');
                setCreateMealSearchResults([]);
                setCreateMealSearchOpen(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.createMealAddIngredientBtnText}>+</Text>
            </TouchableOpacity>
            {createMealItems.length === 0 ? (
              <View style={styles.createMealEmptyIngredients}>
                <Text style={styles.createMealEmptyIngredientsText}>Toca + para buscar y añadir alimentos a tu comida.</Text>
              </View>
            ) : (
              createMealItems.map((it, i) => (
                <View key={i} style={styles.createMealItemRow}>
                  <TouchableOpacity
                    style={styles.createMealItemContent}
                    onPress={() => openCreateMealItemForEdit(it, i)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.createMealItemName} numberOfLines={1}>{it.name}</Text>
                    <Text style={styles.createMealItemMacros} numberOfLines={1}>
                      {Math.round(it.calories || 0)} kcal · P {it.protein ?? 0} · C {it.carbs ?? 0} · G {it.fat ?? 0}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeCreateMealItem(i)} style={styles.createMealItemRemove} activeOpacity={0.7}>
                    <Text style={styles.createFoodServingRemoveText}>Quitar</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.fdLogWrap}>
            <TouchableOpacity
              style={[
                styles.fdLogBtn,
                (createMealItems.length === 0 || createMealSaving) && styles.buscarLogBtnDisabled,
              ]}
              onPress={saveCreateMeal}
              disabled={createMealItems.length === 0 || createMealSaving}
              activeOpacity={0.8}
            >
              <Text style={styles.fdLogBtnText}>
                {createMealSaving ? 'Guardando…' : 'Guardar comida'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </WakeModalOverlay>

      <WakeModalOverlay
        visible={createMealSearchOpen && createMealModalOpen}
        onClose={() => setCreateMealSearchOpen(false)}
        contentPlacement="full"
        contentAnimation="fade"
        closeOnBackdropClick
      >
        <View style={styles.createMealSearchModuleSheet}>
          <View style={[styles.createMealSearchModule, { height: screenHeight * 0.65 }]}>
          <View style={styles.createMealSearchModuleHeader}>
            <Text style={styles.createMealSearchModuleTitle}>Buscar alimento</Text>
            <TouchableOpacity style={styles.createMealSearchModuleClose} onPress={() => setCreateMealSearchOpen(false)} activeOpacity={0.8}>
              <Text style={styles.addModalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.createMealSearchModuleBody}>
            <View style={[styles.buscarSearchWrap, styles.createMealSearchModuleSearchWrap]}>
              <View style={styles.buscarSearchRow}>
                <TextInput
                  style={styles.buscarSearchInput}
                  value={createMealSearchQuery}
                  onChangeText={setCreateMealSearchQuery}
                  placeholder="Buscar alimento…"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  onSubmitEditing={runCreateMealSearch}
                  returnKeyType="search"
                />
                <TouchableOpacity
                  style={styles.buscarFilterToggle}
                  onPress={() => {
                    setBarcodeError('');
                    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                      setCreateMealSearchOpen(false);
                      setFdCreateMeal(true);
                      setBarcodeModalOpen(true);
                      return;
                    }
                    setCreateMealSearchOpen(false);
                    setFdCreateMeal(true);
                    setBarcodeCameraOpen(true);
                  }}
                  activeOpacity={0.8}
                >
                  <SvgBarcodeFile
                    width={26}
                    height={26}
                    fill="rgba(255,255,255,0.5)"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.buscarSavedToggle, createMealSearchShowSaved && styles.buscarSavedToggleActive]}
                  onPress={() => setCreateMealSearchShowSaved((v) => !v)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.buscarSavedToggleIcon,
                      createMealSearchShowSaved && styles.buscarSavedToggleIconActive,
                    ]}
                  >
                    {createMealSearchShowSaved ? '★' : '☆'}
                  </Text>
                </TouchableOpacity>
              </View>

              {!createMealSearchShowSaved &&
                createMealSearchQuery.trim().length > 0 && (
                  <TouchableOpacity
                    style={styles.buscarSearchBtn}
                    onPress={runCreateMealSearch}
                    disabled={createMealSearchLoading}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.buscarSearchBtnText}>
                      {createMealSearchLoading ? 'Buscando…' : 'Buscar en base de datos'}
                    </Text>
                  </TouchableOpacity>
                )}
            </View>

            <ScrollView
              style={styles.createMealSearchModuleResults}
              contentContainerStyle={styles.createMealSearchModuleResultsContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {createMealSearchShowSaved ? (
                createMealSearchFilteredSaved.length === 0 ? (
                  <View style={styles.buscarEmptyState}>
                    <Text style={styles.buscarEmptyText}>
                      {createMealSearchQuery.trim()
                        ? 'No hay alimentos guardados que coincidan.'
                        : 'No tienes alimentos guardados.\nGuarda uno con ☆ al verlo.'}
                    </Text>
                  </View>
                ) : (
                  createMealSearchFilteredSaved.map((sf) => {
                    const gpu = sf.grams_per_unit;
                    let macroMeta;
                    if (gpu && gpu > 0) {
                      const s = 100 / gpu;
                      macroMeta = `${Math.round((sf.calories_per_unit || 0) * s)} kcal · ${Math.round((sf.protein_per_unit || 0) * s * 10) / 10}g P · ${Math.round((sf.carbs_per_unit || 0) * s * 10) / 10}g C · ${Math.round((sf.fat_per_unit || 0) * s * 10) / 10}g G`;
                    } else {
                      macroMeta = `${Math.round(sf.calories_per_unit || 0)} kcal · ${Math.round((sf.protein_per_unit || 0) * 10) / 10}g P · ${Math.round((sf.carbs_per_unit || 0) * 10) / 10}g C · ${Math.round((sf.fat_per_unit || 0) * 10) / 10}g G`;
                    }
                    return (
                      <TouchableOpacity
                        key={sf.id}
                        style={styles.buscarResultItem}
                        onPress={() => handleSelectSavedFoodForCreateMeal(sf)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.buscarResultInfo}>
                          <Text style={styles.buscarResultName} numberOfLines={1}>{sf.name}</Text>
                          <Text style={styles.buscarResultMeta} numberOfLines={1}>{macroMeta}</Text>
                        </View>
                        <Text style={styles.buscarResultAddBtnText}>+</Text>
                      </TouchableOpacity>
                    );
                  })
                )
              ) : (
                <>
                  {createMealSearchLoading && (
                    <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                      <WakeLoader size={40} />
                    </View>
                  )}
                  {!createMealSearchLoading && createMealSearchQuery.trim().length > 0 && createMealSearchSortedResults.length === 0 && (
                    <Text style={styles.createMealSearchModuleEmpty}>Escribe y pulsa Buscar para ver resultados.</Text>
                  )}
                  {!createMealSearchLoading && createMealSearchQuery.trim().length > 0 && createMealSearchSortedResults.map((food) => {
                    const per100 = getPer100g(food);
                    const meta = per100 ? `${per100.calories} kcal · P ${per100.protein}g C ${per100.carbs}g G ${per100.fat}g` : '—';
                    return (
                      <TouchableOpacity
                        key={food.food_id}
                        style={styles.buscarResultItem}
                        onPress={() => selectCreateMealFoodAndOpenFd(food)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.buscarResultInfo}>
                          <Text style={styles.buscarResultName} numberOfLines={1}>{food.food_name ?? food.name ?? ''}</Text>
                          <Text style={styles.buscarResultMeta} numberOfLines={1}>{meta}</Text>
                        </View>
                        <Text style={styles.buscarResultAddBtnText}>+</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {!createMealSearchLoading && createMealSearchQuery.trim().length === 0 && (
                    createMealSearchHistory.length > 0 ? (
                      <>
                        <Text style={styles.buscarHistoryLabel}>Recientes</Text>
                        {createMealSearchHistory.map((item) => (
                          <TouchableOpacity
                            key={item.food_id}
                            style={styles.buscarResultItem}
                            onPress={() => selectCreateMealFoodAndOpenFd({ food_id: item.food_id, food_name: item.food_name })}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.buscarHistoryIcon}>↺</Text>
                            <View style={styles.buscarResultInfo}>
                              <Text style={styles.buscarResultName} numberOfLines={1}>{item.food_name}</Text>
                            </View>
                            <Text style={styles.buscarResultAddBtnText}>+</Text>
                          </TouchableOpacity>
                        ))}
                      </>
                    ) : (
                      <View style={styles.createMealSearchEmptyState}>
                        <Text style={styles.createMealSearchEmptyIcon}>🔍</Text>
                        <Text style={styles.createMealSearchEmptyText}>Aún no has buscado. Escribe algo y pulsa Buscar.</Text>
                      </View>
                    )
                  )}
                </>
              )}
            </ScrollView>
          </View>
          </View>
        </View>
      </WakeModalOverlay>

      <WakeModalOverlay
        visible={createFoodModalOpen}
        onClose={() => {
          if (createFoodSaving) return;
          setCreateFoodModalOpen(false);
          setEditingSavedFood(null);
        }}
        contentPlacement="full"
        contentAnimation="fade"
      >
        <View style={styles.fdScreen}>
          <View style={styles.fdHeader}>
            <TouchableOpacity
              style={styles.fdBackBtn}
              onPress={() => {
                if (createFoodSaving) return;
                setCreateFoodModalOpen(false);
                setEditingSavedFood(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.fdBackBtnText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.fdHeaderTitle}>{editingSavedFood ? 'Editar alimento' : 'Crear alimento'}</Text>
            <View style={styles.fdHeaderRight} />
          </View>

          <ScrollView
            style={styles.fdScroll}
            contentContainerStyle={styles.fdScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.fdNameRow}>
              <TextInput
                style={[styles.fdName, { paddingVertical: 4, paddingRight: 0 }]}
                value={createFoodName}
                onChangeText={setCreateFoodName}
                placeholder="Nombre del alimento"
                placeholderTextColor="rgba(255,255,255,0.35)"
              />
              <View style={{ width: 38 }} />
            </View>

            <Text style={styles.fdInputLabel}>Categoría (opcional)</Text>
            <TextInput
              style={[styles.fdInput, { marginBottom: 20 }]}
              value={createFoodCategory}
              onChangeText={setCreateFoodCategory}
              placeholder="Ej. Pan y cereales"
              placeholderTextColor="rgba(255,255,255,0.35)"
            />

            <Text style={styles.fdSectionLabel}>Medidas</Text>
            {createFoodServings.map((serving, idx) => (
              <View key={serving.serving_id || idx} style={styles.createFoodServingCard}>
                {createFoodServings.length > 1 && (
                  <TouchableOpacity
                    style={styles.createFoodServingRemove}
                    onPress={() => setCreateFoodServings((prev) => prev.filter((_, i) => i !== idx))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.createFoodServingRemoveText}>Eliminar medida</Text>
                  </TouchableOpacity>
                )}
                <View style={styles.createFoodUnitRow}>
                  <View style={[styles.createFoodUnitCol, { flex: 1 }]}>
                    <TextInput
                      style={[styles.fdInput, styles.createFoodUnitInput, { marginBottom: 4 }]}
                      value={serving.serving_description}
                      onChangeText={(t) => setCreateFoodServings((prev) => prev.map((s, i) => i === idx ? { ...s, serving_description: t } : s))}
                      placeholder="1 porción"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />
                    <Text style={styles.createFoodUnitLabel}>Unidad</Text>
                  </View>
                  <View style={styles.createFoodUnitCol}>
                    <TextInput
                      style={[styles.fdInput, styles.createFoodGramsInput, { marginBottom: 4 }]}
                      value={serving.grams_per_unit}
                      onChangeText={(t) => setCreateFoodServings((prev) => prev.map((s, i) => i === idx ? { ...s, grams_per_unit: t } : s))}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />
                    <Text style={styles.createFoodUnitLabel}>g</Text>
                  </View>
                </View>
                <View style={styles.fdCalCard}>
                  <SvgFire width={28} height={28} stroke={ICON_WHITE} fill="none" />
                  <View style={styles.fdCalTexts}>
                    <Text style={styles.fdCalLabel}>Calorías</Text>
                    <TextInput
                      style={styles.fdCalInput}
                      value={serving.calories}
                      onChangeText={(t) => setCreateFoodServings((prev) => prev.map((s, i) => i === idx ? { ...s, calories: t } : s))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />
                  </View>
                </View>
                <View style={styles.fdMacroRow}>
                  <View style={styles.fdMacroCard}>
                    <Steak width={18} height={18} stroke={ICON_WHITE} fill="none" />
                    <Text style={styles.fdMacroLabel}>Proteína (g)</Text>
                    <TextInput
                      style={styles.fdMacroInput}
                      value={serving.protein}
                      onChangeText={(t) => setCreateFoodServings((prev) => prev.map((s, i) => i === idx ? { ...s, protein: t } : s))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />
                  </View>
                  <View style={styles.fdMacroCard}>
                    <Wheat width={18} height={18} stroke={ICON_WHITE} />
                    <Text style={styles.fdMacroLabel}>Carbos (g)</Text>
                    <TextInput
                      style={styles.fdMacroInput}
                      value={serving.carbs}
                      onChangeText={(t) => setCreateFoodServings((prev) => prev.map((s, i) => i === idx ? { ...s, carbs: t } : s))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />
                  </View>
                  <View style={styles.fdMacroCard}>
                    <Avocado width={18} height={18} fill={ICON_WHITE} />
                    <Text style={styles.fdMacroLabel}>Grasa (g)</Text>
                    <TextInput
                      style={styles.fdMacroInput}
                      value={serving.fat}
                      onChangeText={(t) => setCreateFoodServings((prev) => prev.map((s, i) => i === idx ? { ...s, fat: t } : s))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />
                  </View>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={styles.createFoodAddServingBtn}
              onPress={() => setCreateFoodServings((prev) => [...prev, {
                serving_id: `s${Date.now()}`,
                serving_description: '1 porción',
                grams_per_unit: '',
                calories: '',
                protein: '',
                carbs: '',
                fat: '',
              }])}
              activeOpacity={0.8}
            >
              <Text style={styles.createFoodAddServingBtnText}>+ Añadir otra medida</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.fdLogWrap}>
            <TouchableOpacity
              style={[
                styles.fdLogBtn,
                (createFoodSaving || !createFoodName.trim()) && styles.buscarLogBtnDisabled,
              ]}
              onPress={handleSaveCustomFood}
              disabled={createFoodSaving || !createFoodName.trim()}
              activeOpacity={0.8}
            >
              <Text style={styles.fdLogBtnText}>
                {createFoodSaving ? 'Guardando…' : 'Guardar alimento'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </WakeModalOverlay>

      <WakeModalOverlay
        visible={barcodeCameraOpen}
        onClose={() => {
          setBarcodeCameraOpen(false);
        }}
        contentPlacement="full"
        contentAnimation="fade"
      >
        <BarcodeCameraScanner
          onClose={() => {
            setBarcodeCameraOpen(false);
          }}
          onBarcodeScanned={async (scannedCode) => {
            const code = String(scannedCode || '').trim();
            if (!code) return;
            const { ok, error } = await lookupBarcodeAndOpenFood(code);
            if (ok) {
              setBarcodeCameraOpen(false);
              setBarcodeValue('');
              setBarcodeError('');
              return;
            }
            setBarcodeCameraOpen(false);
            setBarcodeValue(code.replace(/[^0-9]/g, ''));
            if (error === 'no_food') {
              setBarcodeError('No encontramos ningún alimento para este código de barras.');
            } else if (error === 'no_servings') {
              setBarcodeError('No pudimos obtener porciones para este código de barras.');
            } else {
              setBarcodeError('No pudimos buscar este código de barras. Inténtalo de nuevo.');
            }
            setBarcodeModalOpen(true);
          }}
          onFallbackToManual={() => {
            setBarcodeCameraOpen(false);
            setBarcodeModalOpen(true);
          }}
        />
      </WakeModalOverlay>

      <WakeModalOverlay
        visible={barcodeModalOpen}
        onClose={() => {
          if (barcodeLoading) return;
          setBarcodeModalOpen(false);
          setBarcodeError('');
        }}
        contentPlacement="full"
        contentAnimation="fade"
      >
        <View style={[styles.createMealModalRoot, styles.barcodeModalRoot]}>
          <View style={styles.barcodeModalBody}>
            <Text style={styles.createMealLabel}>Escribe el código de barras</Text>
            <TextInput
              style={styles.createMealNameInput}
              value={barcodeValue}
              onChangeText={(text) => {
                setBarcodeValue(text.replace(/[^0-9]/g, ''));
                setBarcodeError('');
              }}
              keyboardType="number-pad"
              placeholder="Ej. 7701234567890"
              placeholderTextColor="rgba(255,255,255,0.35)"
            />
            {barcodeError ? (
              <Text style={styles.barcodeErrorText}>{barcodeError}</Text>
            ) : null}
            <TouchableOpacity
              style={[
                styles.crearComidaBtn,
                styles.barcodeLookupBtn,
                (barcodeLoading || !barcodeValue.trim()) && styles.crearComidaBtnDisabled,
              ]}
              onPress={handleBarcodeLookup}
              disabled={barcodeLoading || !barcodeValue.trim()}
              activeOpacity={0.8}
            >
              <Text style={styles.crearComidaBtnText}>
                {barcodeLoading ? 'Buscando…' : 'Buscar por código de barras'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </WakeModalOverlay>

      <WakeModalOverlay
        visible={selectedFood !== null}
        onClose={handleFoodDetailClose}
        contentPlacement="full"
        contentAnimation="fade"
      >
        <Animated.View
          style={[
            styles.fdScreen,
            {
              opacity: fdSlideAnim,
              transform: [
                {
                  translateY: fdSlideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [60, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {selectedFood && (
            <>
              <View style={styles.fdHeader}>
                <TouchableOpacity style={styles.fdBackBtn} onPress={handleFoodDetailClose} activeOpacity={0.7}>
                  <Text style={styles.fdBackBtnText}>←</Text>
                </TouchableOpacity>
                <Text style={styles.fdHeaderTitle}>
                  {editingDiaryEntry ? 'Editar cantidad' : createMealEditingItemIndex !== null ? 'Editar alimento' : 'Alimento seleccionado'}
                </Text>
                {(selectedFood.food_id || '').startsWith('custom-') && selectedSavedFoodForEdit ? (
                  <TouchableOpacity
                    style={styles.fdEditarBtn}
                    onPress={() => {
                      setEditingSavedFood(selectedSavedFoodForEdit);
                      setCreateFoodModalOpen(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.fdEditarBtnText}>Editar</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.fdHeaderRight} />
                )}
              </View>

              <ScrollView style={styles.fdScroll} contentContainerStyle={styles.fdScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.fdNameRow}>
                  <Text style={styles.fdName} numberOfLines={3}>{selectedFood.food_name}</Text>
                  <TouchableOpacity style={styles.fdBookmarkBtn} onPress={handleToggleSaveFood} activeOpacity={0.7}>
                    <Text style={[styles.fdBookmarkIcon, savedFoodIds.has(selectedFood.food_id) && styles.fdBookmarkIconActive]}>
                      {savedFoodIds.has(selectedFood.food_id) ? '★' : '☆'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {editingDiaryEntry ? (
                  <Text style={styles.fdEditHint}>
                    Puedes cambiar la medida (tipo de porción) y la cantidad; al guardar se actualizará el registro del día.
                  </Text>
                ) : createMealEditingItemIndex !== null ? (
                  <Text style={styles.fdEditHint}>
                    Cambia la medida o la cantidad y guarda, o quítalo de la comida.
                  </Text>
                ) : null}

                <Text style={styles.fdSectionLabel}>Medida</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.buscarChipList}
                  style={styles.buscarChipScroll}
                >
                  {selectedFood.servings.map((s, i) => (
                    <TouchableOpacity
                      key={s.serving_id}
                      style={[styles.buscarChip, buscarServingIndex === i && styles.buscarChipActive]}
                      onPress={() => { setBuscarServingIndex(i); setBuscarAmount('1'); }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.buscarChipText, buscarServingIndex === i && styles.buscarChipTextActive]}>
                        {chipLabel(s.serving_description)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.fdServingsRow}>
                  <Text style={styles.fdServingsLabel}>Número de porciones</Text>
                  <TouchableOpacity
                    style={styles.fdServingsPill}
                    onPress={() => fdServingsInputRef.current?.focus()}
                    activeOpacity={1}
                  >
                    {(() => {
                      const s = selectedFood.servings[buscarServingIndex];
                      const qty = Number(buscarAmount) || 1;
                      const displayMain = (() => {
                        const desc = s?.serving_description ?? '';
                        const gpu = s?.metric_serving_amount != null ? Number(s.metric_serving_amount) : (s?.grams_per_unit != null ? Number(s.grams_per_unit) : null);
                        const main = formatQuantityAndServing(qty, desc, gpu).main;
                        return main.replace(/^\d+([.,]\d+)?\s+/i, '');
                      })();
                      return (
                        <View style={styles.fdServingsCenter}>
                          <TextInput
                            ref={fdServingsInputRef}
                            style={styles.fdServingsInput}
                            value={buscarAmount}
                            onChangeText={setBuscarAmount}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                          />
                          <Text style={styles.fdServingsDesc} numberOfLines={1}>{displayMain}</Text>
                        </View>
                      );
                    })()}
                  </TouchableOpacity>
                </View>

                {(() => {
                  const s = selectedFood.servings[buscarServingIndex];
                  const qty = Number(buscarAmount) || 1;
                  const cal = Math.round((Number(s?.calories) || 0) * qty);
                  const prot = ((Number(s?.protein) || 0) * qty).toFixed(1);
                  const carbs = ((Number(s?.carbohydrate) || 0) * qty).toFixed(1);
                  const fat = ((Number(s?.fat) || 0) * qty).toFixed(1);
                  return (
                    <>
                      <View style={styles.fdCalCard}>
                        <SvgFire width={28} height={28} stroke={ICON_WHITE} fill="none" />
                        <View style={styles.fdCalTexts}>
                          <Text style={styles.fdCalLabel}>Calorías</Text>
                          <Text style={styles.fdCalValue}>{cal}</Text>
                        </View>
                      </View>
                      <View style={styles.fdMacroRow}>
                        <View style={styles.fdMacroCard}>
                          <Steak width={18} height={18} stroke={ICON_WHITE} fill="none" />
                          <Text style={styles.fdMacroLabel}>Proteína</Text>
                          <Text style={styles.fdMacroValue}>{prot}g</Text>
                        </View>
                        <View style={styles.fdMacroCard}>
                          <Wheat width={18} height={18} stroke={ICON_WHITE} />
                          <Text style={styles.fdMacroLabel}>Carbos</Text>
                          <Text style={styles.fdMacroValue}>{carbs}g</Text>
                        </View>
                        <View style={styles.fdMacroCard}>
                          <Avocado width={18} height={18} fill={ICON_WHITE} />
                          <Text style={styles.fdMacroLabel}>Grasa</Text>
                          <Text style={styles.fdMacroValue}>{fat}g</Text>
                        </View>
                      </View>
                    </>
                  );
                })()}

                <TouchableOpacity style={styles.fdOtherFacts} onPress={() => setFdShowMicros((v) => !v)} activeOpacity={0.7} disabled={fdLoadingDetail}>
                  <Text style={styles.fdOtherFactsText}>Otros datos nutricionales</Text>
                  {fdLoadingDetail
                    ? <ActivityIndicator size="small" color="rgba(255,255,255,0.35)" />
                    : <Text style={styles.fdOtherFactsArrow}>{fdShowMicros ? '‹' : '›'}</Text>
                  }
                </TouchableOpacity>

                {fdShowMicros && (() => {
                  const s = selectedFood.servings[buscarServingIndex];
                  const qty = Number(buscarAmount) || 1;
                  const rows = MICROS.map(({ key, label, unit }) => {
                    const raw = s?.[key];
                    if (raw == null || raw === '' || raw === '0' || Number(raw) === 0) return null;
                    const val = unit === 'g'
                      ? (Math.round(Number(raw) * qty * 10) / 10)
                      : Math.round(Number(raw) * qty);
                    return { label, val, unit };
                  }).filter(Boolean);
                  if (rows.length === 0) return (
                    <View style={styles.fdMicrosEmpty}>
                      <Text style={styles.fdMicrosEmptyText}>Sin datos adicionales disponibles.</Text>
                    </View>
                  );
                  return (
                    <View style={styles.fdMicrosWrap}>
                      {rows.map(({ label, val, unit }) => (
                        <View key={label} style={styles.fdMicroRow}>
                          <Text style={styles.fdMicroLabel}>{label}</Text>
                          <Text style={styles.fdMicroValue}>{val} {unit}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </ScrollView>

              <View style={styles.fdLogWrap}>
                <TouchableOpacity
                  style={[styles.fdLogBtn, buscarAddLoading && styles.buscarLogBtnDisabled]}
                  onPress={handleBuscarLog}
                  activeOpacity={0.8}
                  disabled={buscarAddLoading}
                >
                  <Text style={styles.fdLogBtnText}>
                    {fdCreateMeal
                      ? (createMealEditingItemIndex !== null
                        ? (buscarAddLoading ? 'Guardando…' : 'Guardar')
                        : (buscarAddLoading ? 'Añadiendo…' : 'Añadir a la comida'))
                      : (buscarAddLoading
                        ? (editingDiaryEntry ? 'Guardando…' : 'Registrando…')
                        : (editingDiaryEntry ? 'Guardar' : 'Registrar'))}
                  </Text>
                </TouchableOpacity>
                {fdCreateMeal && createMealEditingItemIndex !== null && (
                  <TouchableOpacity
                    style={styles.fdRemoveFromMealBtn}
                    onPress={() => {
                      removeCreateMealItem(createMealEditingItemIndex);
                      handleFoodDetailClose();
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.fdRemoveFromMealBtnText}>Quitar de la comida</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </Animated.View>
      </WakeModalOverlay>

      <WakeModalOverlay
        visible={!!recipeVideoModalUrl}
        onClose={() => setRecipeVideoModalUrl(null)}
        contentPlacement="full"
        closeOnBackdropClick={true}
      >
        <View style={styles.recipeVideoFullscreenWrap}>
          {recipeVideoModalUrl ? (
            <Video
              source={{ uri: recipeVideoModalUrl }}
              style={styles.recipeVideoFullscreenVideo}
              useNativeControls
              shouldPlay
              resizeMode={ResizeMode.CONTAIN}
            />
          ) : null}
          <TouchableOpacity
            style={styles.recipeVideoCloseBtn}
            onPress={() => setRecipeVideoModalUrl(null)}
            activeOpacity={0.8}
          >
            <Text style={styles.recipeVideoCloseBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </WakeModalOverlay>

      <WakeModalOverlay
        visible={!!menuEntryId}
        onClose={() => setMenuEntryId(null)}
        contentPlacement="full"
        contentAnimation="fade"
      >
        <View style={styles.menuModalOverlayWrap} pointerEvents="box-none">
          <View style={[styles.menuDropdown, { top: menuAnchor.pageY }]}>
            <TouchableOpacity
              style={styles.menuDropdownItem}
              onPress={() => {
                const entry = diaryEntries.find((e) => e.id === menuEntryId);
                if (entry) handleDeleteDiaryEntry(entry);
              }}
            >
              <Text style={styles.menuDropdownItemTextDelete}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </WakeModalOverlay>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    overflow: 'visible',
  },
  scrollView: {
    flex: 1,
  },
  contentScrollContent: {
    flexGrow: 1,
  },
  content: {
    paddingBottom: 20,
    overflow: 'visible',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 320,
  },
  loadingWrap: {
    width: '100%',
    minHeight: 360,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 320,
    paddingBottom: 40,
  },
  loadingFullScreen: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  dateRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  topCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 0,
    marginBottom: 16,
  },
  topCardLeft: {
    flex: 1,
    paddingLeft: 16,
  },
  labelCrossfadeWrap: {
    position: 'relative',
    minHeight: 16,
    marginTop: 4,
    alignSelf: 'stretch',
    width: '100%',
  },
  labelCrossfadeInner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  caloriesLeftLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
  },
  caloriesLeftValue: {
    fontSize: 36,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  caloriesLeftPlanned: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  pieWrap: {
    width: 140,
    height: 140,
    position: 'relative',
  },
  pieIconCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltip: {
    backgroundColor: 'rgba(30,30,30,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    padding: 8,
  },
  tooltipText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.95)',
  },
  macroRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  macroCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    minHeight: 120,
  },
  macroCardPie: {
    width: 72,
    height: 72,
    marginBottom: 4,
    position: 'relative',
  },
  macroCardText: {
    alignSelf: 'stretch',
    alignItems: 'flex-start',
  },
  macroPieIconCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroCardValue: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  macroCardLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  consumedPlannedRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  macroCardPlanned: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  categoriesSection: {
    marginTop: 8,
    gap: 16,
  },
  categoryBlock: {
    gap: 4,
    paddingBottom: 8,
  },
  mealSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    marginBottom: 2,
  },
  mealMacroSummary: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 4,
  },
  diaryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  diaryItemEmoji: {
    fontSize: 28,
    width: 40,
    textAlign: 'center',
    marginRight: 12,
  },
  diaryItemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.92)',
    marginRight: 12,
  },
  diaryItemRight: {
    alignItems: 'flex-end',
    minWidth: 64,
  },
  diaryItemAmount: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'right',
  },
  diaryItemSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
    textAlign: 'right',
    marginTop: 1,
  },
  diaryItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  diaryItemMenuBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  diaryItemMenuIcon: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 20,
  },
  menuBackdrop: {
    flex: 1,
  },
  menuModalOverlayWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  menuDropdown: {
    position: 'absolute',
    right: 16,
    backgroundColor: 'rgba(28, 27, 27, 0.98)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    minWidth: 150,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 16,
  },
  menuDropdownItem: {
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  menuDropdownItemTextDelete: {
    fontSize: 15,
    color: 'rgba(255, 75, 75, 0.95)',
    fontWeight: '500',
  },
  mealAddButton: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealAddButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  noPlan: {
    padding: 24,
    alignItems: 'center',
  },
  noPlanText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
  },
  addModalWrapper: {
    flex: 1,
  },
  addModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  addModalOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 72,
    bottom: 0,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  addModalContent: {
    flex: 1,
    paddingTop: 0,
    paddingHorizontal: 20,
  },
  addModalHeader: {
    marginBottom: 16,
    position: 'relative',
  },
  addModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addModalCategoryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    paddingRight: 8,
    flexWrap: 'nowrap',
  },
  addModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  addModalChevronWrap: {
    transform: [{ rotate: '0deg' }],
  },
  addModalChevronWrapOpen: {
    transform: [{ rotate: '180deg' }],
  },
  addModalCloseBtn: {
    padding: 8,
  },
  addModalCloseText: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.85)',
  },
  addModalCategoryDropdown: {
    marginTop: 4,
    backgroundColor: 'rgba(30,30,30,0.98)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    maxHeight: 220,
  },
  addModalCategoryDropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  addModalCategoryDropdownItemActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  addModalCategoryDropdownItemLast: {
    borderBottomWidth: 0,
  },
  addModalCategoryDropdownItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
  },
  addModalTabBar: {
    marginBottom: 16,
  },
  addModalTabHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    paddingVertical: 8,
    minHeight: 44,
  },
  addModalTabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  addModalTabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    zIndex: 1,
  },
  addModalTabTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  addModalTabTitleInactive: {
    opacity: 0.45,
  },
  addModalBody: {
    flex: 1,
    minHeight: 0,
  },
  addModalPage: {
    flex: 1,
    minHeight: 0,
  },
  opcionesSection: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 0,
  },
  opcionesCarouselAndPagination: {
    flex: 1,
    minHeight: 0,
  },
  opcionesCarousel: {
    flex: 1,
    minHeight: 0,
  },
  opcionesCarouselContent: {
    flexGrow: 1,
    alignItems: 'stretch',
  },
  opcionesPaginationContainer: {
    width: '100%',
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    paddingBottom: 8,
  },
  opcionesPaginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  opcionesPaginationDot: {
    width: 8,
    height: 8,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    marginHorizontal: 4,
  },
  opcionesOptionNameWrap: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opcionesOptionName: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  opcionesCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 300,
    justifyContent: 'space-between',
  },
  opcionesCardInner: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  mealBanner: {
    width: '100%',
    height: 180,
    position: 'relative',
    overflow: 'hidden',
  },
  mealBannerEmoji: {
    position: 'absolute',
    opacity: 0.9,
    userSelect: 'none',
    transform: 'translate(-50%, -50%)',
  },
  recipeVideoPlayWrap: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeVideoPlayCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeVideoPlayIcon: {
    fontSize: 28,
    color: '#fff',
    marginLeft: 4,
  },
  recipeVideoPlayLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
  },
  recipeVideoFullscreenWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  recipeVideoFullscreenVideo: {
    width: '100%',
    height: '100%',
  },
  recipeVideoCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  recipeVideoCloseBtnText: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '600',
  },
  opcionesCardEmpty: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  noOpcionesOptionCardWrap: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  noOpcionesFillParent: {
    flex: 1,
    alignSelf: 'stretch',
    position: 'relative',
  },
  noOpcionesEmptyRoot: {
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  noOpcionesEmojiBg: {
    overflow: 'hidden',
  },
  noOpcionesEmojiCell: {
    opacity: 0.85,
  },
  noOpcionesOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  noOpcionesGlassWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    zIndex: 10,
  },
  noOpcionesGlassCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 20,
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  noOpcionesGlassCardWeb: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  },
  noOpcionesGlassCardInner: {
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  noOpcionesGlassText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  opcionesCardHeader: {
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  opcionesCardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    marginBottom: 6,
  },
  opcionesCardMacroLine: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '400',
  },
  opcionesCardMacrosRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  opcionesCardMacroItem: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.38)',
  },
  opcionesCardMacroSep: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 8,
  },
  opcionesCardIngredients: {
    flex: 1,
    minHeight: 0,
  },
  opcionesCardIngredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  opcionesCardIngredientRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  opcionesCardIngredientAmountBlock: {
    alignItems: 'flex-end',
  },
  opcionesCardIngredientName: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.92)',
    flex: 1,
    marginRight: 12,
  },
  opcionesCardIngredientAmount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  opcionesCardIngredientAmountSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
  opcionesCardCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  opcionesCardCheckboxChecked: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderColor: 'rgba(255,255,255,0.8)',
  },
  opcionesCardCheckboxCheck: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  opcionesCardAddBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  opcionesCardAddBtnDisabled: {
    opacity: 0.6,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  opcionesCardAddBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  opcionesCardAddBtnTextDisabled: {
    color: 'rgba(26,26,26,0.6)',
  },

  misComidasHeader: {
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  misComidasSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 0,
  },
  misComidasSearchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 15,
  },
  misComidasPlusBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  misComidasPlusBtnText: {
    fontSize: 24,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 28,
  },
  misComidasSubTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  misComidasSubTabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  misComidasSubTabBtnActive: {
    borderBottomColor: 'rgba(255,255,255,0.9)',
  },
  misComidasSubTabText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  misComidasSubTabTextActive: {
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
  },
  misComidasAddChoiceCard: {
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 24,
    paddingVertical: 24,
    minWidth: 260,
    maxWidth: 320,
    shadowColor: 'rgba(0,0,0,0.6)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 4,
  },
  misComidasAddChoiceTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
  },
  misComidasAddChoiceButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  misComidasAddChoiceBtn: {
    backgroundColor: 'transparent',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
  },
  misComidasAddChoiceBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  misComidasSection: {
    marginBottom: 24,
  },
  misComidasColTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  misComidasList: {
    gap: 16,
  },
  misComidasFoodList: {
    gap: 0,
  },
  crearComidaBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
  },
  crearComidaBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  crearComidaBtnDisabled: {
    opacity: 0.5,
  },
  misComidasLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  misComidasEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  misComidasEmptyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 8,
  },
  misComidasEmptySub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  misComidasScroll: {
    flex: 1,
  },
  misComidasScrollContent: {
    paddingBottom: 32,
  },
  misComidasCard: {
    marginBottom: 0,
  },

  createMealModalRoot: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  barcodeModalRoot: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  createMealModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  createMealModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  createMealModalClose: {
    padding: 8,
  },
  createMealModalScroll: {
    flex: 1,
  },
  createMealNameInputFd: {
    flex: 1,
    marginBottom: 0,
  },
  createMealLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
    marginTop: 16,
  },
  createMealNameInput: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 15,
  },
  buscarSearchInputFd: {
    marginBottom: 0,
  },
  createMealItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  createMealItemContent: {
    flex: 1,
    marginRight: 12,
  },
  createMealItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.97)',
  },
  createMealItemMacros: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  createMealItemRemove: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  createMealItemRemoveText: {
    fontSize: 13,
    color: 'rgba(255,100,100,0.9)',
  },
  createMealEmptyIngredients: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderStyle: 'dashed',
  },
  createMealEmptyIngredientsText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  createMealTotalsCard: {
    marginBottom: 28,
  },
  createMealAddIngredientBtn: {
    width: '100%',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  createMealAddIngredientBtnText: {
    fontSize: 22,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  createMealSearchModuleSheet: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  createMealSearchModule: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  createMealSearchModuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  createMealSearchModuleTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  createMealSearchModuleClose: {
    padding: 8,
  },
  createMealSearchModuleBody: {
    flex: 1,
    minHeight: 0,
    padding: 20,
    paddingTop: 12,
  },
  createMealSearchModuleSearchWrap: {
    flex: 0,
    flexShrink: 0,
    flexBasis: 'auto',
  },
  createMealSearchModuleInput: {
    marginBottom: 12,
  },
  createMealSearchModuleResults: {
    flex: 1,
    minHeight: 0,
    marginTop: 12,
  },
  createMealSearchModuleResultsContent: {
    paddingTop: 12,
    paddingBottom: 16,
  },
  createMealSearchModuleEmpty: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingVertical: 24,
  },
  createMealSearchEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  createMealSearchEmptyIcon: {
    fontSize: 28,
    marginBottom: 10,
    opacity: 0.6,
  },
  createMealSearchEmptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 20,
  },
  createMealServingFoodName: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.97)',
    marginBottom: 10,
  },
  createMealServingBlock: {
    marginTop: 12,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  createMealAddRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  createMealAddBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  createMealAddBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  createMealSearchBlock: {
    marginTop: 12,
  },
  createMealServingAmountRow: {
    marginTop: 10,
  },
  createMealServingActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  createMealCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  createMealCancelBtnText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  createMealManualBlock: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  createMealManualRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  createMealSaveBtn: {
    marginTop: 28,
  },
  createFoodUnitRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    width: '100%',
    maxWidth: '100%',
    marginBottom: 16,
  },
  createFoodUnitCol: {
    alignItems: 'flex-start',
    minWidth: 0,
  },
  createFoodUnitInput: {
    width: '100%',
    minWidth: 0,
  },
  createFoodUnitLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 4,
  },
  createFoodGramsInput: {
    width: 72,
    minWidth: 72,
    flex: 0,
  },
  createFoodServingCard: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  createFoodServingRemove: {
    alignSelf: 'flex-end',
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  createFoodServingRemoveText: {
    fontSize: 13,
    color: 'rgba(255,100,100,0.9)',
  },
  createFoodAddServingBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 12,
  },
  createFoodAddServingBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },

  // Buscar tab
  barcodeModalBody: {
    flex: 1,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  barcodeLookupBtn: {
    alignSelf: 'center',
    minWidth: 0,
  },
  barcodeHelperText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
  },
  barcodeErrorText: {
    fontSize: 13,
    color: 'rgba(255, 100, 100, 0.95)',
    marginTop: 6,
  },
  buscarSection: {
    flex: 1,
    minHeight: 0,
  },
  buscarSearchWrap: {
    flex: 1,
    minHeight: 0,
  },
  buscarDetailWrap: {
    flex: 1,
    minHeight: 0,
  },
  buscarSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  buscarSearchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 15,
  },
  buscarFilterToggle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  buscarFilterToggleActive: {
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  buscarFilterToggleIcon: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.5)',
  },
  buscarFilterToggleIconActive: {
    color: 'rgba(255,255,255,0.95)',
  },
  buscarFilterDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  buscarFilterPanel: {
    backgroundColor: 'rgba(30,30,30,0.98)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 10,
    overflow: 'hidden',
  },
  buscarFilterPanelTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  buscarFilterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  buscarFilterOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  buscarFilterOptionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '400',
  },
  buscarFilterOptionTextActive: {
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
  },
  buscarFilterOptionCheck: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
  },
  buscarSavedToggle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buscarSavedToggleActive: {
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  buscarSavedToggleIcon: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.5)',
  },
  buscarSavedToggleIconActive: {
    color: 'rgba(255,255,255,0.95)',
  },
  buscarSearchBtn: {
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    marginBottom: 10,
  },
  buscarSearchBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  buscarResultsList: {
    flex: 1,
  },
  buscarResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    gap: 10,
  },
  buscarResultEmoji: {
    fontSize: 22,
    width: 34,
    textAlign: 'center',
  },
  buscarResultInfo: {
    flex: 1,
    minWidth: 0,
  },
  buscarResultName: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.95)',
  },
  buscarResultMeta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.42)',
    marginTop: 2,
  },
  buscarResultAddBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buscarResultAddBtnText: {
    fontSize: 20,
    lineHeight: 20,
    includeFontPadding: false,
    color: 'rgba(255,255,255,0.7)',
  },
  buscarEmptyState: {
    paddingTop: 40,
    alignItems: 'center',
  },
  buscarEmptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.38)',
    textAlign: 'center',
    lineHeight: 22,
  },
  buscarHistoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
    marginTop: 4,
  },
  buscarHistoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  buscarHistoryIcon: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.3)',
    width: 20,
    textAlign: 'center',
  },
  buscarHistoryText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
  },

  // Food detail
  buscarDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  buscarBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buscarBackBtnText: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.85)',
  },
  buscarDetailName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  buscarSaveBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buscarSaveBtnText: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.4)',
  },
  buscarSaveBtnTextActive: {
    color: 'rgba(255,255,255,0.95)',
  },
  buscarDetailScroll: {
    flex: 1,
  },
  buscarDetailSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.6,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  buscarChipScroll: {
    marginBottom: 18,
  },
  buscarChipList: {
    gap: 8,
    paddingRight: 4,
  },
  buscarChip: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  buscarChipActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.92)',
  },
  buscarChipText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  buscarChipTextActive: {
    color: '#1a1a1a',
    fontWeight: '700',
  },
  buscarServingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  buscarServingsLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  buscarServingsInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  buscarServingsInput: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    minWidth: 32,
    maxWidth: 56,
    textAlign: 'right',
  },
  buscarServingsUnit: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    maxWidth: 100,
  },
  buscarCalCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14,
    padding: 16,
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  buscarCalLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 8,
    marginBottom: 2,
  },
  buscarCalValue: {
    fontSize: 40,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  buscarMacroRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  buscarMacroCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
  },
  buscarMacroLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.42)',
    marginTop: 6,
    marginBottom: 2,
  },
  buscarMacroValue: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  buscarLogBtn: {
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    marginTop: 8,
  },
  buscarLogBtnDisabled: {
    opacity: 0.55,
  },
  buscarLogBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  // Food detail full-screen modal
  fdScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  fdHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  fdBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fdBackBtnText: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.9)',
  },
  fdHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  fdHeaderRight: {
    width: 38,
  },
  fdEditarBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fdEditarBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  fdScroll: {
    flex: 1,
  },
  fdScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  fdInput: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: 'rgba(255,255,255,0.97)',
  },
  fdInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  fdNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 28,
    gap: 12,
  },
  fdName: {
    flex: 1,
    fontSize: 26,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.97)',
    lineHeight: 32,
  },
  fdBookmarkBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  fdBookmarkIcon: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.4)',
  },
  fdBookmarkIconActive: {
    color: 'rgba(255,255,255,0.95)',
  },
  fdSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  fdEditHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 16,
    lineHeight: 18,
  },
  fdServingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  fdServingsLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  fdServingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  fdServingsCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  fdServingsInput: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    minWidth: 14,
    maxWidth: 72,
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  fdServingsInputText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  fdServingsDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  fdCalCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
  },
  fdCalTexts: {
    flex: 1,
  },
  fdCalLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 2,
  },
  fdCalValue: {
    fontSize: 32,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.97)',
    lineHeight: 38,
  },
  fdCalInput: {
    fontSize: 32,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.97)',
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    minWidth: 60,
  },
  fdMacroRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  fdMacroCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14,
    padding: 12,
    alignItems: 'flex-start',
  },
  fdMacroLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.42)',
    marginTop: 6,
    marginBottom: 2,
  },
  fdMacroValue: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  fdMacroInput: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    marginTop: 2,
  },
  fdOtherFacts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  fdOtherFactsText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  fdOtherFactsArrow: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.4)',
  },
  fdLogWrap: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  fdLogBtn: {
    paddingVertical: 16,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
  },
  fdLogBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  fdRemoveFromMealBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  fdRemoveFromMealBtnText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },
  fdMicrosWrap: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    marginBottom: 8,
  },
  fdMicroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  fdMicroLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  fdMicroValue: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
  },
  fdMicrosEmpty: {
    paddingVertical: 14,
  },
  fdMicrosEmptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
  fatsecretAttributionWeb: {
    marginTop: 24,
    marginBottom: 8,
    alignItems: 'center',
  },
  fatsecretAttributionText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
});

export default NutritionScreen;
