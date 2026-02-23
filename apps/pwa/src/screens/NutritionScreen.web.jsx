import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Modal,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import * as nutritionDb from '../services/nutritionFirestoreService';
import * as nutritionApi from '../services/nutritionApiService';
import logger from '../utils/logger';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import SvgFire from '../components/icons/vectors_fig/Environment/Fire';
import Steak from '../components/icons/Steak';
import Wheat from '../components/icons/Wheat';
import Avocado from '../components/icons/Avocado';
import SvgChevronDown from '../components/icons/vectors_fig/Arrow/ChevronDown';

const GOLD = 'rgba(191, 168, 77, 1)';
const ICON_WHITE = 'rgba(255,255,255,0.95)';
const REMAINING_GRAY = 'rgba(255, 255, 255, 0.12)';
const GOLD_FILL = 'rgba(191, 168, 77, 0.45)';
const OVER_LIMIT_RED = 'rgba(255, 68, 68, 0.3)';

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
  const gramsPerUnit = it.grams_per_unit != null ? Number(it.grams_per_unit) : (it.serving_weight_grams != null ? Number(it.serving_weight_grams) : null);
  let unitLabel = (it.unit ?? it.serving_unit ?? it.unit_name ?? it.serving_description ?? '').trim();
  if (!unitLabel && Array.isArray(it.servings) && it.serving_id != null) {
    const s = it.servings.find((ss) => String(ss.serving_id) === String(it.serving_id));
    if (s?.serving_description) unitLabel = String(s.serving_description).trim();
  }
  if (unitLabel || gramsPerUnit != null) return formatQuantityAndServing(numUnits, unitLabel || (gramsPerUnit != null ? 'g' : ''), gramsPerUnit);
  if (amount != null && amount !== '') return { main: String(amount), sub: null };
  return { main: '—', sub: null };
}

function formatDiaryServing(entry) {
  const units = Number(entry.number_of_units) || 1;
  let unit = (entry.serving_unit ?? entry.serving_description ?? '').trim();
  if (!unit && Array.isArray(entry.servings) && entry.serving_id != null) {
    const s = entry.servings.find((ss) => String(ss.serving_id) === String(entry.serving_id));
    if (s?.serving_description) unit = String(s.serving_description).trim();
  }
  const gramsPerUnit = entry.grams_per_unit != null ? Number(entry.grams_per_unit) : null;
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

const NutritionScreen = () => {
  const navigate = useNavigate();
  const { width: screenWidth } = useWindowDimensions();
  const { user } = useAuth();
  const userId = user?.uid ?? auth.currentUser?.uid ?? '';

  const [assignment, setAssignment] = useState(null);
  const [plan, setPlan] = useState(null);
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [macroShowLeft, setMacroShowLeft] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addModalTab, setAddModalTab] = useState('opciones');
  const [addModalCategoryIndex, setAddModalCategoryIndex] = useState(0);
  const [addModalCategoryDropdownOpen, setAddModalCategoryDropdownOpen] = useState(false);
  const [opcionesCardIndex, setOpcionesCardIndex] = useState(0);
  const [addOptionLoading, setAddOptionLoading] = useState(false);
  const [opcionesSelectedByCard, setOpcionesSelectedByCard] = useState({});
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
  const [buscarHistory, setBuscarHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wake_food_items') || '[]'); } catch { return []; }
  });
  const [fdShowMicros, setFdShowMicros] = useState(false);
  const [fdLoadingDetail, setFdLoadingDetail] = useState(false);
  const [editingDiaryEntry, setEditingDiaryEntry] = useState(null);
  const [fdAmountPickerVisible, setFdAmountPickerVisible] = useState(false);
  const [menuEntryId, setMenuEntryId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState({ pageY: 0 });

  const fdAmountScrollRef = useRef(null);
  const GRAM_PICKER_ITEM_HEIGHT = 44;
  const GRAM_PICKER_MAX = 2000;

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

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const dateForPlan = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date();
      const { plan: p, assignment: a } = await nutritionDb.getEffectivePlanForUser(userId, dateForPlan);
      setAssignment(a);
      setPlan(p);
    } catch (e) {
      logger.error('[NutritionScreen] getEffectivePlanForUser error:', e);
    }
    try {
      const entries = await nutritionDb.getDiaryEntries(userId, selectedDate);
      setDiaryEntries(entries);
    } catch (e) {
      logger.error('[NutritionScreen] getDiaryEntries error:', e);
    }
    setLoading(false);
  }, [userId, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddOptionToMeal = useCallback(
    async (option, category, selectedIndices) => {
      if (!userId || !selectedDate) return;
      const items = option?.items ?? option?.foods ?? [];
      const foodItems = items.filter((it) => it.recipe !== true);
      const toAdd = selectedIndices.length > 0
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
            protein: it.protein != null ? Number(it.protein) : (it.protein_g != null ? Number(it.protein_g) : null),
            carbs: it.carbs != null ? Number(it.carbs) : (it.carbs_g != null ? Number(it.carbs_g) : (it.carbohydrate != null ? Number(it.carbohydrate) : null)),
            fat: it.fat != null ? Number(it.fat) : (it.fat_g != null ? Number(it.fat_g) : null),
            serving_unit: it.serving_unit ?? null,
            grams_per_unit: it.grams_per_unit ?? null,
            servings: it.servings ?? null,
          });
        }
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
    setFdLoadingDetail(true);
    // Save to item history
    setBuscarHistory((prev) => {
      const item = { food_id: foodId, food_name: foodName };
      const next = [item, ...prev.filter((h) => h.food_id !== foodId)].slice(0, 10);
      try { localStorage.setItem('wake_food_items', JSON.stringify(next)); } catch {}
      return next;
    });
    // Fetch full data for micronutrients and all servings
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

  const handleFdAmountScrollEnd = useCallback((e) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / GRAM_PICKER_ITEM_HEIGHT);
    const val = Math.max(1, Math.min(GRAM_PICKER_MAX, index + 1));
    setBuscarAmount(String(val));
  }, []);

  useEffect(() => {
    if (!fdAmountPickerVisible) return;
    const val = Math.max(1, Math.min(GRAM_PICKER_MAX, Math.round(Number(buscarAmount) || 1)));
    const y = (val - 1) * GRAM_PICKER_ITEM_HEIGHT;
    const t = setTimeout(() => {
      fdAmountScrollRef.current?.scrollTo({ y, animated: false });
    }, 80);
    return () => clearTimeout(t);
  }, [fdAmountPickerVisible]);

  const handleBuscarLog = useCallback(async () => {
    if (!userId || !selectedDate || !selectedFood) return;
    const serving = selectedFood.servings[buscarServingIndex];
    if (!serving) return;
    const qty = Number(buscarAmount) || 1;
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
        const meal = getMealIdForCategory(activeCats[addModalCategoryIndex] ?? null);
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
        await loadData();
        setAddModalVisible(false);
      }
    } catch (e) {
      logger.error('[NutritionScreen] handleBuscarLog:', e);
    } finally {
      setBuscarAddLoading(false);
    }
  }, [userId, selectedDate, selectedFood, buscarServingIndex, buscarAmount, plan, addModalCategoryIndex, loadData, editingDiaryEntry]);

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
    return cats.filter((cat) => {
      const options = cat.options ?? cat.meal_options ?? [];
      return options.length > 0;
    });
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

  const selectedCategory = categoriesWithFood[addModalCategoryIndex] ?? null;
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
    if (addModalVisible && addModalTab === 'buscar') {
      loadSavedFoods();
    }
  }, [addModalVisible, addModalTab, loadSavedFoods]);

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
    }
  }, [addModalVisible]);

  const opcionesCardMargin = screenWidth * 0.08;
  const opcionesCardWidth = screenWidth - opcionesCardMargin * 2;
  const opcionesCardGap = 0;
  const opcionesCardStep = opcionesCardWidth + opcionesCardGap;
  const opcionesCardViewHeight = 540;

  return (
    <View style={styles.container}>
      <FixedWakeHeader showBackButton onBackPress={() => navigate('/')} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <WakeHeaderSpacer />
        <WakeHeaderContent>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={GOLD} />
            </View>
          ) : (
            <>
              <View style={styles.dateRow}>
                <Text style={styles.dateLabel}>Día</Text>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={dateInputStyle}
                />
              </View>

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
                                setAddModalVisible(true);
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

              {!plan && !loading && (
                <View style={styles.noPlan}>
                  <Text style={styles.noPlanText}>No tienes un plan de nutrición asignado.</Text>
                </View>
              )}
            </>
          )}
        </WakeHeaderContent>
        <BottomSpacer />
      </ScrollView>

      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.addModalWrapper}>
          <TouchableOpacity
            style={styles.addModalBackdrop}
            activeOpacity={1}
            onPress={() => setAddModalVisible(false)}
          />
          <View style={styles.addModalOverlay}>
            <View style={styles.addModalContent}>
            <View style={styles.addModalHeader}>
              <View style={styles.addModalTitleRow}>
                <TouchableOpacity
                  style={styles.addModalCategoryPicker}
                  onPress={() => setAddModalCategoryDropdownOpen((v) => !v)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addModalTitle} numberOfLines={1}>
                    {categoriesWithFood[addModalCategoryIndex]?.label ?? 'Sin nombre'}
                  </Text>
                  <View style={[styles.addModalChevronWrap, addModalCategoryDropdownOpen && styles.addModalChevronWrapOpen]}>
                    <SvgChevronDown width={20} height={20} stroke="rgba(255,255,255,0.9)" />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addModalCloseBtn}
                  onPress={() => setAddModalVisible(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addModalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              {addModalCategoryDropdownOpen && categoriesWithFood.length > 0 && (
                <View style={styles.addModalCategoryDropdown}>
                  {categoriesWithFood.map((cat, i) => (
                    <TouchableOpacity
                      key={`cat-${i}-${cat.label ?? ''}`}
                      style={[
                        styles.addModalCategoryDropdownItem,
                        i === addModalCategoryIndex && styles.addModalCategoryDropdownItemActive,
                        i === categoriesWithFood.length - 1 && styles.addModalCategoryDropdownItemLast,
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
                      width: '33.333%',
                      left: addModalTab === 'opciones' ? '0%' : addModalTab === 'buscar' ? '33.333%' : '66.666%',
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
                          style={[styles.buscarFilterToggle, (buscarFilterOpen || buscarSortBy !== 'relevance') && styles.buscarFilterToggleActive]}
                          onPress={() => setBuscarFilterOpen((v) => !v)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.buscarFilterToggleIcon, buscarSortBy !== 'relevance' && styles.buscarFilterToggleIconActive]}>⇅</Text>
                          {buscarSortBy !== 'relevance' && <View style={styles.buscarFilterDot} />}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.buscarSavedToggle, buscarShowSaved && styles.buscarSavedToggleActive]}
                          onPress={() => { setBuscarShowSaved((v) => !v); setBuscarFilterOpen(false); }}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.buscarSavedToggleIcon, buscarShowSaved && styles.buscarSavedToggleIconActive]}>
                            {buscarShowSaved ? '★' : '☆'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {buscarFilterOpen && (
                        <View style={styles.buscarFilterPanel}>
                          <Text style={styles.buscarFilterPanelTitle}>Ordenar por</Text>
                          {[
                            { key: 'relevance', label: 'Relevancia' },
                            { key: 'cal_asc',   label: 'Calorías ↑' },
                            { key: 'cal_desc',  label: 'Calorías ↓' },
                            { key: 'protein_desc', label: 'Proteína ↓' },
                            { key: 'name_asc',  label: 'Nombre A–Z' },
                          ].map((opt) => (
                            <TouchableOpacity
                              key={opt.key}
                              style={[styles.buscarFilterOption, buscarSortBy === opt.key && styles.buscarFilterOptionActive]}
                              onPress={() => { setBuscarSortBy(opt.key); setBuscarFilterOpen(false); }}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.buscarFilterOptionText, buscarSortBy === opt.key && styles.buscarFilterOptionTextActive]}>
                                {opt.label}
                              </Text>
                              {buscarSortBy === opt.key && <Text style={styles.buscarFilterOptionCheck}>✓</Text>}
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      {!buscarShowSaved && !buscarFilterOpen && buscarQuery.trim().length > 0 && (
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
                        <ScrollView style={styles.buscarResultsList} showsVerticalScrollIndicator={false}>
                          {buscarShowSaved ? (
                            sortedSavedFoods.length === 0 ? (
                              <View style={styles.buscarEmptyState}>
                                <Text style={styles.buscarEmptyText}>No tienes alimentos guardados.{'\n'}Guarda uno con ☆ al verlo.</Text>
                              </View>
                            ) : (
                              sortedSavedFoods.map((sf) => {
                                const gpu = sf.grams_per_unit;
                                let macroMeta;
                                if (gpu && gpu > 0) {
                                  const s = 100 / gpu;
                                  macroMeta = `${Math.round((sf.calories_per_unit || 0) * s)} kcal · ${(Math.round((sf.protein_per_unit || 0) * s * 10) / 10)}g P · ${(Math.round((sf.carbs_per_unit || 0) * s * 10) / 10)}g C · ${(Math.round((sf.fat_per_unit || 0) * s * 10) / 10)}g G`;
                                } else {
                                  macroMeta = `${Math.round(sf.calories_per_unit || 0)} kcal · ${Math.round((sf.protein_per_unit || 0) * 10) / 10}g P · ${Math.round((sf.carbs_per_unit || 0) * 10) / 10}g C · ${Math.round((sf.fat_per_unit || 0) * 10) / 10}g G`;
                                }
                                return (
                                  <TouchableOpacity
                                    key={sf.id}
                                    style={styles.buscarResultItem}
                                    onPress={() => handleSelectSavedFood(sf)}
                                    activeOpacity={0.8}
                                  >
                                    <View style={styles.buscarResultInfo}>
                                      <Text style={styles.buscarResultName} numberOfLines={1}>{sf.name}</Text>
                                      <Text style={styles.buscarResultMeta} numberOfLines={1}>{macroMeta}</Text>
                                    </View>
                                    <TouchableOpacity style={styles.buscarResultAddBtn} onPress={() => handleSelectSavedFood(sf)} activeOpacity={0.8}>
                                      <Text style={styles.buscarResultAddBtnText}>+</Text>
                                    </TouchableOpacity>
                                  </TouchableOpacity>
                                );
                              })
                            )
                          ) : sortedBuscarResults.length === 0 ? (
                            buscarLoading ? (
                              <View style={styles.buscarEmptyState}>
                                <ActivityIndicator color="rgba(255,255,255,0.7)" />
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
                                    onPress={() => handleSelectFood({ food_id: item.food_id, food_name: item.food_name, food_category: item.food_category ?? null, servings: { serving: [] } })}
                                    activeOpacity={0.8}
                                  >
                                    <Text style={styles.buscarHistoryIcon}>↺</Text>
                                    <View style={styles.buscarResultInfo}>
                                      <Text style={styles.buscarResultName} numberOfLines={1}>{item.food_name}</Text>
                                    </View>
                                    <TouchableOpacity
                                      style={styles.buscarResultAddBtn}
                                      onPress={() => handleSelectFood({ food_id: item.food_id, food_name: item.food_name, food_category: item.food_category ?? null, servings: { serving: [] } })}
                                      activeOpacity={0.8}
                                    >
                                      <Text style={styles.buscarResultAddBtnText}>+</Text>
                                    </TouchableOpacity>
                                  </TouchableOpacity>
                                ))}
                              </>
                            ) : (
                              <View style={styles.buscarEmptyState}>
                                <Text style={styles.buscarEmptyText}>Busca un alimento para empezar.</Text>
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
                                    <Text style={styles.buscarResultName} numberOfLines={1}>{food.food_name}</Text>
                                    <Text style={styles.buscarResultMeta} numberOfLines={1}>{macroMeta}</Text>
                                  </View>
                                  <TouchableOpacity style={styles.buscarResultAddBtn} onPress={() => handleSelectFood(food)} activeOpacity={0.8}>
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
                <View style={styles.opcionesSection}>
                  <View style={[styles.opcionesCarouselAndPagination, { marginHorizontal: -20, width: screenWidth }]}>
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
                      },
                    ]}
                    style={[styles.opcionesCarousel, { height: opcionesCardViewHeight }]}
                    onScroll={Animated.event(
                      [{ nativeEvent: { contentOffset: { x: opcionesScrollX } } }],
                      { useNativeDriver: false }
                    )}
                    onMomentumScrollEnd={(e) => {
                      const x = e.nativeEvent.contentOffset.x;
                      const idx = Math.round(x / opcionesCardStep);
                      setOpcionesCardIndex(Math.min(idx, Math.max(0, opcionesOptions.length - 1)));
                    }}
                    onScrollEndDrag={(e) => {
                      const x = e.nativeEvent.contentOffset.x;
                      const idx = Math.round(x / opcionesCardStep);
                      setOpcionesCardIndex(Math.min(idx, Math.max(0, opcionesOptions.length - 1)));
                    }}
                  >
                    {opcionesOptions.length === 0 ? (
                      <View style={[styles.opcionesCard, { width: opcionesCardWidth }]}>
                        <Text style={styles.opcionesCardEmpty}>No hay opciones para esta categoría.</Text>
                      </View>
                    ) : (
                      opcionesOptions.map((opt, idx) => {
                        const items = opt.items ?? opt.foods ?? [];
                        const macros = optionMacros(opt);
                        const categoryLabel = categoriesWithFood[addModalCategoryIndex]?.label ?? 'comida';
                        const isRecipe = opt.recipe === true;
                        const optionTitle = opt.label ?? opt.name ?? `Opción ${idx + 1}`;
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
                              { width: opcionesCardWidth, marginRight: idx < opcionesOptions.length - 1 ? opcionesCardGap : 0 },
                              { opacity, transform: [{ scale }] },
                            ]}
                          >
                            <MealImageBanner items={items} colorIndex={idx} categoryIndex={addModalCategoryIndex} />
                            <View style={styles.opcionesCardInner}>
                              <View style={styles.opcionesCardHeader}>
                                {isRecipe && (
                                  <Text style={styles.opcionesCardTitle} numberOfLines={1}>{optionTitle}</Text>
                                )}
                                <Text style={styles.opcionesCardMacroLine}>
                                  {`${Math.round(macros.calories)} kcal  ·  ${Math.round(macros.protein)}g Prot  ·  ${Math.round(macros.carbs)}g C  ·  ${Math.round(macros.fat)}g G`}
                                </Text>
                              </View>
                              <View style={styles.opcionesCardIngredients}>
                                {items.length === 0 ? (
                                  <View style={styles.opcionesCardIngredientRow}>
                                    <Text style={styles.opcionesCardIngredientName}>—</Text>
                                    <Text style={styles.opcionesCardIngredientAmount}>—</Text>
                                  </View>
                                ) : (
                                  items.map((it, i) => {
                                    const selected = selectedSet.includes(i);
                                    const right = formatIngredientRight(it);
                                    return (
                                      <TouchableOpacity
                                        key={i}
                                        style={styles.opcionesCardIngredientRow}
                                        onPress={() => toggleItem(i)}
                                        activeOpacity={0.7}
                                      >
                                        <Text style={styles.opcionesCardIngredientName} numberOfLines={1}>
                                          {getFoodEmoji(it)}{'  '}{it.name ?? 'Alimento'}
                                        </Text>
                                        <View style={styles.opcionesCardIngredientRight}>
                                          <View style={styles.opcionesCardIngredientAmountBlock}>
                                            <Text style={styles.opcionesCardIngredientAmount} numberOfLines={1}>
                                              {right.main}
                                            </Text>
                                            {right.sub != null && (
                                              <Text style={styles.opcionesCardIngredientAmountSub} numberOfLines={1}>
                                                {right.sub}
                                              </Text>
                                            )}
                                          </View>
                                          <View style={[styles.opcionesCardCheckbox, selected && styles.opcionesCardCheckboxChecked]}>
                                            {selected && <Text style={styles.opcionesCardCheckboxCheck}>✓</Text>}
                                          </View>
                                        </View>
                                      </TouchableOpacity>
                                    );
                                  })
                                )}
                              </View>
                              <TouchableOpacity
                                style={[
                                  styles.opcionesCardAddBtn,
                                  (addOptionLoading || selectedCount === 0) && styles.opcionesCardAddBtnDisabled,
                                ]}
                                activeOpacity={0.8}
                                onPress={() => handleAddOptionToMeal(opt, selectedCategory, selectedSet)}
                                disabled={addOptionLoading || selectedCount === 0}
                              >
                                <Text style={[
                                  styles.opcionesCardAddBtnText,
                                  selectedCount === 0 && styles.opcionesCardAddBtnTextDisabled,
                                ]}>
                                  {addOptionLoading ? 'Añadiendo…' : `Añadir a ${categoryLabel}`}
                                </Text>
                              </TouchableOpacity>
                            </View>
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
                              style={[styles.opcionesPaginationDot, { opacity, transform: [{ scale }] }]}
                            />
                          );
                        })}
                      </View>
                    </View>
                  )}
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
        </View>
      </Modal>

      <Modal
        visible={selectedFood !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={() => { setSelectedFood(null); setEditingDiaryEntry(null); }}
      >
        <View style={styles.fdScreen}>
          {selectedFood && (
            <>
              <View style={styles.fdHeader}>
                <TouchableOpacity style={styles.fdBackBtn} onPress={() => { setSelectedFood(null); setEditingDiaryEntry(null); }} activeOpacity={0.7}>
                  <Text style={styles.fdBackBtnText}>←</Text>
                </TouchableOpacity>
                <Text style={styles.fdHeaderTitle}>{editingDiaryEntry ? 'Editar cantidad' : 'Alimento seleccionado'}</Text>
                <View style={styles.fdHeaderRight} />
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
                  <View style={styles.fdServingsPill}>
                    {(() => {
                      const s = selectedFood.servings[buscarServingIndex];
                      const isGramServing = s && is1gServing(s);
                      const qty = Number(buscarAmount) || 1;
                      const displayMain = (() => {
                        const desc = s?.serving_description ?? '';
                        const gpu = s?.metric_serving_amount != null ? Number(s.metric_serving_amount) : (s?.grams_per_unit != null ? Number(s.grams_per_unit) : null);
                        const main = formatQuantityAndServing(qty, desc, gpu).main;
                        return main.replace(/^\d+([.,]\d+)?\s+/i, '');
                      })();
                      if (isGramServing) {
                        return (
                          <TouchableOpacity
                            style={styles.fdServingsCenter}
                            onPress={() => setFdAmountPickerVisible(true)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.fdServingsInputText}>{Math.round(qty)}</Text>
                            <Text style={styles.fdServingsDesc}>g</Text>
                          </TouchableOpacity>
                        );
                      }
                      return (
                        <View style={styles.fdServingsCenter}>
                          <TextInput
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
                  </View>
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
                    {buscarAddLoading
                      ? (editingDiaryEntry ? 'Guardando…' : 'Registrando…')
                      : (editingDiaryEntry ? 'Guardar' : 'Registrar')}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>

      <Modal
        visible={fdAmountPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFdAmountPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.gramPickerOverlay}
          activeOpacity={1}
          onPress={() => setFdAmountPickerVisible(false)}
        >
          <View style={styles.gramPickerCard} onStartShouldSetResponder={() => true}>
            <View style={styles.gramPickerHeader}>
              <Text style={styles.gramPickerTitle}>Cantidad (g)</Text>
              <TouchableOpacity onPress={() => setFdAmountPickerVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.gramPickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.gramPickerRow}>
              <ScrollView
                ref={fdAmountScrollRef}
                style={styles.gramPickerScroll}
                contentContainerStyle={styles.gramPickerContent}
                showsVerticalScrollIndicator={false}
                snapToInterval={GRAM_PICKER_ITEM_HEIGHT}
                snapToAlignment="center"
                decelerationRate="fast"
                onMomentumScrollEnd={handleFdAmountScrollEnd}
              >
                {Array.from({ length: GRAM_PICKER_MAX }, (_, i) => {
                  const val = i + 1;
                  const selected = (Number(buscarAmount) || 1) === val;
                  return (
                    <TouchableOpacity
                      key={`g-${val}`}
                      style={styles.gramPickerItem}
                      onPress={() => {
                        setBuscarAmount(String(val));
                        fdAmountScrollRef.current?.scrollTo({ y: i * GRAM_PICKER_ITEM_HEIGHT, animated: true });
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.gramPickerItemText, selected && styles.gramPickerItemTextSelected]}>{val}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text style={styles.gramPickerUnit}>g</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={!!menuEntryId}
        transparent
        animationType="none"
        onRequestClose={() => setMenuEntryId(null)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setMenuEntryId(null)}
        >
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
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const dateInputStyle = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.95)',
  fontSize: 14,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 320,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingTop: 60,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  dateLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
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
  opcionesSection: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 0,
  },
  opcionesCarouselAndPagination: {
    flexGrow: 0,
    flexShrink: 0,
  },
  opcionesCarousel: {},
  opcionesCarouselContent: {
    paddingVertical: 8,
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
  opcionesCardEmpty: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
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

  // Buscar tab
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
    flex: 1,
    backgroundColor: '#1a1a1a',
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
  fdScroll: {
    flex: 1,
  },
  fdScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '55%',
  },
  fdServingsCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  fdServingsInput: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    minWidth: 28,
    maxWidth: 80,
    textAlign: 'center',
    paddingVertical: 0,
  },
  fdServingsInputText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  fdServingsDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  gramPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  gramPickerCard: {
    backgroundColor: 'rgba(28,28,28,0.98)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    minWidth: 160,
    maxWidth: 220,
  },
  gramPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  gramPickerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  gramPickerClose: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
    padding: 4,
  },
  gramPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  gramPickerScroll: {
    height: 132,
    width: 72,
  },
  gramPickerContent: {
    paddingVertical: 44,
  },
  gramPickerItem: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gramPickerItemText: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
  },
  gramPickerItemTextSelected: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 22,
  },
  gramPickerUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
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
});

export default NutritionScreen;
