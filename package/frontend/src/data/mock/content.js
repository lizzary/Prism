// What the mock gallery is made of: its groups, the tagger's vocabulary, ComfyUI prompts and the user's own words.

// ------------------------------------------------------------------ picture sizes
const D = {
  sdxlP: [832, 1216], sdxlP2: [896, 1152], sdxlT: [768, 1344], sdxlS: [1024, 1024], sdxlL: [1216, 832], sdxlW: [1344, 768],
  hiresP: [1248, 1824], fluxP: [896, 1152], fluxL: [1344, 768], fluxS: [1024, 1024],
  a4: [2480, 3508], p23: [1600, 2400], p34: [1800, 2400], p43: [2400, 1800], sq: [3000, 3000], uhd: [3840, 2160], fhd: [1920, 1080],
  qhd: [2560, 1440], uw: [5120, 2160], p32: [2048, 1365], tall: [1080, 1920],
  av: [1024, 1024], av2: [800, 800], av3: [512, 512],
  v169: [1280, 720], v1080: [1920, 1080], v916: [720, 1280], vsq: [512, 512],
};

// ------------------------------------------------------------------ colour groups
export const SWATCH = {
  rose: '#d4878a', coral: '#dd9474', amber: '#d9a54e', sand: '#c4ad7c', moss: '#8eab73', sage: '#86a48f',
  teal: '#5f9e9a', sky: '#78a6cf', cobalt: '#6c88c8', lavender: '#9a8ac6', plum: '#b07aa6', slate: '#8893a5',
};

/**
 * by: how the mock sorts a group's files into a configuration —
 *   'palette' (by the picture's colours, `map` palette → colour group index), 'cut' (a character's hair),
 *   'random' (`weights`, the rest stays outside every colour group).
 */
const TONE = { name: '色调', by: 'palette', groups: [['冷蓝', SWATCH.cobalt], ['暖金', SWATCH.amber], ['紫雾', SWATCH.lavender], ['墨色', SWATCH.slate]],
  map: { night: 0, deep: 0, lagoon: 0, amber: 1, dawn: 1, peach: 1, lavender: 2, dusk: 2, sakura: 2, slate: 3 } };
const RATING = { name: '评分', by: 'random', groups: [['精选', SWATCH.amber], ['可用', SWATCH.moss], ['待定', SWATCH.sand], ['废弃', SWATCH.rose]], weights: [0.12, 0.36, 0.18, 0.1] };

/**
 * A collection sorted by artist: a hundred and twenty colour groups, a few with many files and most with a handful —
 * the kind of configuration that needs the outline to find and order. Its own random stream (`seed`), so adding it
 * leaves every other file of the sample as it was.
 */
const ARTIST_NAMES = [
  'あおい', '白夜', 'Kurone', 'みなと', '雨宮', 'Sora', '柊', 'Lumi', '千夜', 'Noct', 'ゆずき', '鹿野', 'Mizu', '青嵐', 'Haru', '夕凪',
  'Akira', '星見', 'Rin', '灯', 'Kiyo', 'ことは', '月白', 'Nagi', '藤原', 'Mio', '冬木', 'Shiki', '朝霧', 'Hoshi', '紬', 'Yoru',
  '葵井', 'Tsuki', '零', 'Kaede', '七瀬', 'Aki', '水無月', 'Ren', '琥珀', 'Hinata', '桐生', 'Natsu', '雪代', 'Iroha', '真白', 'Kaze',
  '蒼井', 'Yume', '綾瀬', 'Hikari', '霧島', 'Asahi', '小春', 'Raku', '若葉', 'Tomo', '梓', 'Sui', '久遠', 'Yuu', '翠', 'Momo',
  '朔', 'Ao', '千歳', 'Kuu', '日向', 'Neko', '秋月', 'Shion', '陽炎', 'Mochi', '凛', 'Fuyu', '風花', 'Tama', '紫苑', 'Koto',
  '瑠璃', 'Yui', '遥', 'Tsubaki', '茜', 'Hana', '湊', 'Sakura', '響', 'Kumo', '澪', 'Ume', '葉月', 'Kai', '詩', 'Yoi',
  '空色', 'Mint', '黎明', 'Ash', '浅葱', 'Lilac', '海月', 'Moss', '橙', 'Pale', '墨', 'Dawn', '鈴', 'Haze', '雫', 'Ember',
  '杏', 'Fern', '雲雀', 'Opal', '藍', 'Wren', '燈', 'Iris',
];
const ARTISTS = {
  name: '画师', by: 'random', seed: 'artist',
  groups: ARTIST_NAMES.map((name, k) => [name, Object.values(SWATCH)[(k * 5) % 12]]),
  // a long tail: the first few artists hold many files, most hold a few, and some files belong to none
  weights: (() => { const w = ARTIST_NAMES.map((_, k) => 1 / (k + 4) ** 0.85); const sum = w.reduce((a, b) => a + b, 0); return w.map((x) => (x / sum) * 0.93); })(),
};

// ------------------------------------------------------------------ groups
// kind decides the file names: comfy (ComfyUI output) · pixiv · fanbox · mixed · video
// age: [newest, oldest] file in days; imported: days since the last import; cover: the cover picture's size
export const GROUPS = [
  { key: 'starry', name: '星空与夜景', kind: 'comfy', family: 'animagine', count: 342, styles: ['moonlit', 'town', 'aurora', 'bokeh', 'portrait', 'moonlit'],
    palettes: ['night', 'deep', 'lavender', 'lagoon', 'amber', 'slate'], dims: [D.sdxlP, D.sdxlL, D.sdxlW, D.sdxlS, D.hiresP], cover: [1344, 768], coverStyle: 'moonlit',
    age: [1, 120], imported: 2, created: 160, configs: [TONE, RATING], user: 0.14 },
  { key: 'kotori', name: 'Fanbox · 雨宮ことり', kind: 'fanbox', handle: 'kotori', count: 128, styles: ['portrait', 'botanic', 'portrait', 'hills'],
    palettes: ['sakura', 'dusk', 'peach', 'lavender'], dims: [D.a4, D.p23, D.sq], cover: [2480, 3508], coverStyle: 'portrait',
    age: [6, 420], imported: 6, created: 430, user: 0.2,
    configs: [{ name: '系列', by: 'random', groups: [['春日', SWATCH.rose], ['制服', SWATCH.cobalt], ['和服', SWATCH.plum], ['夏日', SWATCH.teal]], weights: [0.26, 0.26, 0.2, 0.2] }] },
  { key: 'land', name: 'Pixiv 收藏 · 风景', kind: 'pixiv', count: 486, styles: ['hills', 'sea', 'waves', 'botanic', 'pixel', 'aurora', 'hills'],
    palettes: ['dawn', 'mint', 'lagoon', 'sage', 'peach', 'forest', 'slate', 'dusk'], dims: [D.uhd, D.fhd, D.p43, D.qhd, D.uw], cover: [5120, 2160], coverStyle: 'hills',
    age: [3, 700], imported: 3, created: 710, user: 0.1,
    configs: [{ name: '季节', by: 'palette', groups: [['春', SWATCH.rose], ['夏', SWATCH.teal], ['秋', SWATCH.coral], ['冬', SWATCH.sky]],
      map: { sakura: 0, dawn: 0, lavender: 0, mint: 1, lagoon: 1, forest: 1, sage: 1, peach: 2, amber: 2, dusk: 2, slate: 3, night: 3, deep: 3 } }, ARTISTS] },
  { key: 'chara', name: 'SDXL 角色立绘', kind: 'comfy', family: 'sdxl', count: 256, styles: ['portrait'],
    palettes: ['lavender', 'sakura', 'slate', 'amber', 'mint', 'peach'], dims: [D.sdxlP, D.sdxlT, D.sdxlP2], cover: [768, 1344], coverStyle: 'portrait',
    age: [4, 90], imported: 4, created: 95, user: 0.16,
    configs: [{ name: '发型', by: 'cut', groups: [['长发', SWATCH.lavender], ['短发', SWATCH.teal], ['双马尾', SWATCH.rose], ['马尾', SWATCH.amber]] },
      { name: '待修', by: 'random', groups: [['手部要修', SWATCH.rose], ['背景要换', SWATCH.sand]], weights: [0.08, 0.06] }] },
  { key: 'wall', name: '壁纸 · 4K', kind: 'mixed', count: 94, styles: ['sea', 'hills', 'aurora', 'moonlit', 'town'],
    palettes: ['lagoon', 'deep', 'night', 'dawn', 'mint', 'dusk'], dims: [D.uhd, D.qhd, D.uw], cover: [3840, 2160], coverStyle: 'aurora',
    age: [9, 300], imported: 9, created: 310, user: 0.3 },
  { key: 'cats', name: '猫', kind: 'pixiv', count: 59, styles: ['cat'], palettes: ['dawn', 'lavender', 'amber', 'peach', 'dusk', 'lagoon', 'sage'],
    dims: [D.p34, D.sq, D.p43], cover: [3000, 3000], coverStyle: 'cat', age: [12, 380], imported: 12, created: 390, user: 0.18 },
  { key: 'motion', name: '动态与短片', kind: 'video', video: 0.85, count: 37, styles: ['moonlit', 'sea', 'aurora', 'bokeh', 'town'],
    palettes: ['night', 'deep', 'lagoon', 'amber', 'dusk'], dims: [D.v169, D.v1080, D.v916, D.vsq], cover: [1920, 1080], coverStyle: 'sea', coverVideo: true,
    age: [5, 160], imported: 5, created: 170, user: 0.1 },
  { key: 'flux', name: 'FLUX 测试', kind: 'comfy', family: 'flux', count: 118, styles: ['stilllife', 'portrait', 'sea', 'cat', 'bokeh'],
    palettes: ['sage', 'peach', 'amber', 'lagoon', 'slate'], dims: [D.fluxP, D.fluxL, D.fluxS], cover: [896, 1152], coverStyle: 'stilllife',
    age: [8, 140], imported: 8, created: 150, user: 0.12 },
  { key: 'animagine', name: 'Animagine 4.0 出图', kind: 'comfy', family: 'animagine', count: 204, styles: ['portrait', 'portrait', 'moonlit', 'botanic'],
    palettes: ['sakura', 'lavender', 'mint', 'night', 'peach'], dims: [D.sdxlP, D.sdxlP2, D.sdxlS], cover: [1024, 1024], coverStyle: 'portrait',
    age: [2, 75], imported: 2, created: 80, user: 0.12,
    configs: [{ name: 'LoRA 强度', by: 'random', groups: [['0.6', SWATCH.sage], ['0.8', SWATCH.sky], ['1.0', SWATCH.lavender]], weights: [0.3, 0.36, 0.26] }] },
  { key: 'street', name: '城市与街景', kind: 'pixiv', count: 152, styles: ['town', 'bokeh', 'pixel', 'town'],
    palettes: ['amber', 'night', 'deep', 'dusk', 'slate'], dims: [D.uhd, D.p43, D.fhd, D.p34], cover: [2400, 1800], coverStyle: 'town',
    age: [15, 520], imported: 15, created: 530, user: 0.08 },
  { key: 'flora', name: '花与植物', kind: 'mixed', count: 88, styles: ['botanic', 'stilllife', 'botanic'],
    palettes: ['sakura', 'sage', 'mint', 'lavender', 'dawn', 'forest'], dims: [D.p34, D.sq, D.p43], cover: [1800, 2400], coverStyle: 'botanic',
    age: [20, 460], imported: 20, created: 470, user: 0.14 },
  { key: 'seaside', name: '海边的夏天', kind: 'mixed', count: 71, styles: ['sea', 'waves', 'portrait', 'sea'],
    palettes: ['lagoon', 'peach', 'mint', 'dawn', 'deep'], dims: [D.uhd, D.p43, D.p34, D.p32], cover: [2048, 1365], coverStyle: 'sea',
    age: [25, 300], imported: 25, created: 310, user: 0.12,
    configs: [{ name: '时段', by: 'palette', groups: [['清晨', SWATCH.sky], ['正午', SWATCH.amber], ['黄昏', SWATCH.coral]],
      map: { lagoon: 0, mint: 0, deep: 0, dawn: 1, peach: 2 } }] },
  { key: 'avatar', name: '头像候选', kind: 'mixed', count: 46, styles: ['portrait', 'cat', 'portrait'],
    palettes: ['sakura', 'lagoon', 'amber', 'lavender', 'mint'], dims: [D.av, D.av2, D.av3], cover: [1024, 1024], coverStyle: 'portrait',
    age: [30, 400], imported: 30, created: 410, user: 0.25 },
  { key: 'arch', name: '建筑参考', kind: 'pixiv', count: 77, styles: ['bauhaus', 'town', 'pixel'],
    palettes: ['slate', 'amber', 'sage', 'deep'], dims: [D.p34, D.p43, D.sq], cover: [1600, 2400], coverStyle: 'bauhaus',
    age: [40, 600], imported: 40, created: 610, user: 0.1 },
  { key: 'uniform', name: 'Illustrious · 制服', kind: 'comfy', family: 'illustrious', count: 166, styles: ['portrait'],
    palettes: ['slate', 'sakura', 'lagoon', 'mint', 'lavender'], dims: [D.sdxlP, D.sdxlT], cover: [832, 1216], coverStyle: 'portrait',
    age: [10, 60], imported: 10, created: 62, user: 0.1,
    configs: [{ name: '服装', by: 'random', groups: [['冬服', SWATCH.cobalt], ['夏服', SWATCH.teal]], weights: [0.46, 0.44] }] },
  { key: 'colors', name: '配色参考', kind: 'pixiv', count: 52, styles: ['bauhaus', 'waves', 'hills'],
    palettes: ['amber', 'dusk', 'lagoon', 'sage', 'peach', 'forest'], dims: [D.sq, D.p43], cover: [2560, 1440], coverStyle: 'bauhaus',
    age: [50, 540], imported: 50, created: 550, user: 0.2 },
  { key: 'archive', name: '旧图归档 2023', kind: 'mixed', count: 418, styles: ['hills', 'moonlit', 'sea', 'botanic', 'bauhaus', 'waves', 'town', 'portrait', 'cat'],
    palettes: ['dusk', 'dawn', 'mint', 'lagoon', 'lavender', 'sakura', 'forest', 'amber', 'night', 'slate', 'peach', 'sage', 'deep'],
    dims: [D.p23, D.fhd, D.sq, D.p43, D.sdxlP], cover: [1365, 2048], coverStyle: 'botanic', age: [330, 700], imported: 330, created: 720, user: 0.06,
    configs: [{ name: '季度', by: 'random', groups: [['一季度', SWATCH.sage], ['二季度', SWATCH.teal], ['三季度', SWATCH.amber], ['四季度', SWATCH.lavender]], weights: [0.25, 0.25, 0.25, 0.25] }] },
  { key: 'pony', name: 'Pony 实验', kind: 'comfy', family: 'pony', count: 73, styles: ['portrait', 'cat', 'bokeh'],
    palettes: ['dusk', 'lavender', 'amber', 'night'], dims: [D.sdxlP, D.sdxlL], cover: [1216, 832], coverStyle: 'bokeh',
    age: [45, 110], imported: 45, created: 115, user: 0.08 },
  { key: 'lora', name: 'LoRA 训练集 · 角色 A', kind: 'mixed', count: 40, styles: ['portrait'], palettes: ['lagoon', 'mint'],
    dims: [D.av, D.sdxlS], cover: [1024, 1024], coverStyle: 'portrait', age: [60, 75], imported: 60, created: 76, user: 1, userTag: '角色 A' },
  { key: 'winter', name: '冬天', kind: 'mixed', count: 64, styles: ['aurora', 'hills', 'moonlit', 'pixel'],
    palettes: ['slate', 'night', 'deep', 'lagoon'], dims: [D.uhd, D.p34], cover: [1800, 2400], coverStyle: 'aurora',
    age: [1, 340], imported: 1, created: 350, user: 0.12 },
  { key: 'pixel', name: '像素风', kind: 'pixiv', count: 48, styles: ['pixel'], palettes: ['lagoon', 'forest', 'mint', 'sakura', 'deep', 'dusk'],
    dims: [D.p43, D.sq, D.p34], cover: [2400, 1350], coverStyle: 'pixel', age: [70, 400], imported: 70, created: 410, user: 0.1 },
  { key: 'watercolor', name: '水彩风格测试', kind: 'comfy', family: 'sdxl', count: 56, styles: ['botanic', 'hills', 'portrait'],
    palettes: ['sage', 'peach', 'sakura', 'mint'], dims: [D.sdxlP, D.sdxlL], cover: [1216, 832], coverStyle: 'botanic',
    age: [80, 130], imported: 80, created: 135, user: 0.1 },
  { key: 'inbox', name: '未整理', kind: 'mixed', count: 213, styles: ['hills', 'moonlit', 'sea', 'botanic', 'town', 'portrait', 'cat', 'bokeh', 'stilllife'],
    palettes: ['dusk', 'dawn', 'mint', 'lagoon', 'lavender', 'sakura', 'amber', 'night', 'peach'], dims: [D.tall, D.fhd, D.sdxlP, D.p34, D.sq],
    cover: [1080, 1920], coverStyle: 'bokeh', age: [0, 40], imported: 0, created: 200, user: 0.04 },
  { key: 'skeb', name: 'Skeb 委托', kind: 'pixiv', count: 18, styles: ['portrait'], palettes: ['peach', 'sakura', 'lavender'],
    dims: [D.a4, D.p34], cover: [2480, 3508], coverStyle: 'portrait', age: [90, 500], imported: 90, created: 510, user: 0.3 },
  { key: 'dusk', name: '黄昏色彩研究', kind: 'comfy', family: 'sdxl', count: 84, styles: ['hills', 'sea', 'town', 'portrait'],
    palettes: ['dusk', 'amber', 'dawn', 'peach'], dims: [D.sdxlL, D.sdxlW, D.sdxlP], cover: [1536, 640], coverStyle: 'sea',
    age: [100, 160], imported: 100, created: 165, user: 0.12 },
  { key: 'hires', name: 'Hires Fix 对比', kind: 'comfy', family: 'animagine', hires: true, count: 32, styles: ['portrait', 'moonlit'],
    palettes: ['night', 'lavender', 'sakura'], dims: [D.sdxlP, D.hiresP], cover: [1248, 1824], coverStyle: 'portrait',
    age: [120, 125], imported: 120, created: 126, user: 0.1 },
  { key: 'draft', name: '草稿', kind: 'mixed', count: 0, styles: [], palettes: [], dims: [], age: [0, 0], imported: 3, created: 3 },
];

// ------------------------------------------------------------------ the tagger's vocabulary (booru style)
export const STYLE_TAGS = {
  hills: { always: ['scenery', 'outdoors', 'no_humans', 'sky'], some: ['mountain', 'landscape', 'hill', 'horizon', 'gradient_sky', 'sun', 'cloud', 'bird', 'field', 'mountainous_horizon', 'sunset', 'sunrise', 'evening'] },
  moonlit: { always: ['night', 'night_sky', 'starry_sky', 'moon', 'scenery', 'outdoors'], some: ['full_moon', 'hill', 'silhouette', 'sitting', 'cat', 'from_behind', 'star_(sky)', 'grass', 'wide_shot', 'moonlight'] },
  sea: { always: ['ocean', 'horizon', 'scenery', 'outdoors', 'water'], some: ['sky', 'sun', 'sunset', 'reflection', 'island', 'waves', 'no_humans', 'beach', 'cloud', 'sunlight', 'gradient_sky', 'summer'] },
  botanic: { always: ['flower', 'plant', 'no_humans'], some: ['leaf', 'still_life', 'simple_background', 'white_background', 'pink_flower', 'yellow_flower', 'stem', 'botanical', 'flat_color', 'blooming'] },
  bauhaus: { always: ['abstract', 'geometric_pattern', 'no_humans'], some: ['pattern', 'colorful', 'flat_color', 'circle', 'triangle', 'square', 'tile', 'minimalism', 'shape'] },
  waves: { always: ['wave', 'pattern', 'no_humans'], some: ['ocean', 'seigaiha', 'water', 'sun', 'traditional_media', 'ukiyo-e', 'sky', 'japanese_style'] },
  town: { always: ['night', 'city', 'building', 'no_humans', 'scenery'], some: ['cityscape', 'window', 'city_lights', 'crescent_moon', 'starry_sky', 'skyline', 'rooftop', 'outdoors', 'light'] },
  portrait: { always: ['1girl', 'solo', 'upper_body', 'school_uniform', 'serafuku', 'sailor_collar'], some: ['smile', 'blush', 'bangs', 'neck_ribbon', 'red_ribbon', 'petals', 'cherry_blossoms', 'closed_mouth', 'light_smile', 'gradient_background', 'backlighting', 'light_particles', 'depth_of_field', 'portrait', 'wind', 'floating_hair', 'white_sailor_collar'] },
  cat: { always: ['cat', 'no_humans', 'animal_focus'], some: ['indoors', 'window', 'sunlight', 'sitting', 'tail', 'whiskers', 'animal', 'looking_at_viewer', 'full_body', 'shadow'] },
  aurora: { always: ['aurora', 'night_sky', 'starry_sky', 'scenery', 'no_humans'], some: ['snow', 'mountain', 'winter', 'landscape', 'outdoors', 'night', 'star_(sky)', 'polar', 'cold'] },
  bokeh: { always: ['bokeh', 'depth_of_field', 'no_humans'], some: ['blurry', 'light_particles', 'abstract', 'lens_flare', 'night', 'city_lights', 'glowing', 'light', 'blurry_background'] },
  pixel: { always: ['pixel_art', 'scenery', 'no_humans'], some: ['tree', 'pine_tree', 'mountain', 'cloud', 'sun', 'outdoors', 'landscape', 'forest', 'retro_artstyle', 'sky'] },
  stilllife: { always: ['still_life', 'no_humans', 'indoors'], some: ['flower', 'vase', 'cup', 'saucer', 'table', 'sunlight', 'fruit', 'window_shadow', 'food', 'teacup', 'shadow'] },
};
export const PALETTE_TAGS = {
  dusk: ['sunset', 'purple_theme', 'gradient_sky'], dawn: ['pastel_colors', 'orange_theme'], mint: ['green_theme', 'pastel_colors'],
  lagoon: ['blue_theme', 'aqua_theme'], lavender: ['purple_theme', 'pastel_colors'], sakura: ['pink_theme', 'pastel_colors'],
  forest: ['green_theme', 'nature'], amber: ['orange_theme', 'warm_colors'], night: ['blue_theme', 'dark'], slate: ['grey_theme', 'muted_color'],
  peach: ['orange_theme', 'pastel_colors'], sage: ['green_theme', 'muted_color'], deep: ['blue_theme', 'dark'],
};
export const EXTRA_TAGS = ['soft_focus', 'light_rays', 'cinematic_lighting', 'film_grain', 'chromatic_aberration', 'vignetting', 'dappled_sunlight',
  'cloudy_sky', 'blue_sky', 'gradient', 'wide_shot', 'dutch_angle', 'atmospheric_perspective', 'lineart', 'sketch', 'watercolor_(medium)', 'highres',
  'border', 'letterboxed', 'limited_palette', 'high_contrast', 'muted_color', 'flat_color', 'no_lineart', 'bloom', 'god_rays', 'dusk', 'shade'];

/** The long tail: things the tagger notices now and then in any picture. */
export const LONG_TAIL = ['long_sleeves', 'short_sleeves', 'holding', 'standing', 'hand_up', 'from_side', 'profile', 'looking_away', 'looking_up',
  'head_tilt', 'parted_lips', 'hat', 'beret', 'hood', 'scarf', 'gloves', 'earrings', 'necklace', 'hairclip', 'hairband', 'hair_bow', 'hair_ribbon',
  'ahoge', 'sidelocks', 'blunt_bangs', 'hair_between_eyes', 'medium_hair', 'very_long_hair', 'wavy_hair', 'braid', 'side_ponytail', 'jacket',
  'coat', 'cardigan', 'sweater', 'hoodie', 'pleated_skirt', 'dress', 'white_dress', 'sundress', 'frills', 'kimono', 'yukata', 'umbrella', 'book',
  'headphones', 'glasses', 'drink', 'cake', 'ice_cream', 'balloon', 'paper_lantern', 'lantern', 'candle', 'rain', 'water_drop', 'puddle',
  'snowing', 'falling_leaves', 'autumn_leaves', 'maple_leaf', 'sunflower', 'rose', 'hydrangea', 'wisteria', 'flower_field', 'grass', 'bush',
  'forest', 'river', 'lake', 'bridge', 'stairs', 'railing', 'fence', 'road', 'street', 'crosswalk', 'power_lines', 'utility_pole', 'vending_machine',
  'train', 'train_station', 'bicycle', 'boat', 'lighthouse', 'pier', 'shrine', 'torii', 'castle', 'tower', 'ruins', 'cafe', 'classroom', 'library',
  'bedroom', 'curtains', 'shelf', 'clock', 'lamp', 'paper', 'pencil', 'easel', 'piano', 'guitar', 'musical_note', 'sparkle', 'butterfly', 'feather',
  'fish', 'goldfish', 'jellyfish', 'whale', 'dog', 'rabbit', 'fox', 'deer', 'planet', 'galaxy', 'nebula', 'space', 'shooting_star', 'constellation',
  'rim_lighting', 'water_reflection', 'rainbow', 'caustics', 'fog', 'mist', 'twilight', 'golden_hour', 'blue_hour', 'overcast', 'lightning',
  'cumulonimbus_cloud', 'contrail', 'airplane', 'paper_airplane', 'stuffed_toy', 'ribbon', 'christmas', 'fireworks', 'summer_festival', 'balcony',
  'window_seat', 'greenhouse', 'aquarium', 'picture_frame', 'camera', 'sitting_on_ledge', 'wide_sleeves', 'cityscape_view', 'snowflakes', 'tears'];

// ------------------------------------------------------------------ the user's own words
export const USER_TAGS = ['精选', '壁纸候选', '头像', '待修', '参考', '灵感', '配色好', '构图好', '已发布', '打印', '喜欢', '系列 · 星夜', 'todo', 'WIP', '收藏', '可做封面'];
export const NOTES = [
  '高清修复后细节好很多，可以作为这一组的基准。',
  '这一张的配色可以用到下一组里。',
  '原图来自 pixiv，作者允许个人收藏。',
  '种子不错，换个 LoRA 再试试。',
  '准备打印 A4 尺寸，记得留出血。',
  '构图参考：三分法，视线落在右上。',
  '手部需要局部重绘。',
  '和上一张是同一个种子，只改了采样器。',
  'Already shared in the group chat.',
  'Use as the cover for the next batch.',
];

// ------------------------------------------------------------------ ComfyUI
export const MODELS = {
  animagine: ['animagine-xl-4.0.safetensors', 'animagine-xl-4.0-opt.safetensors'],
  sdxl: ['sd_xl_base_1.0.safetensors', 'juggernautXL_v9.safetensors', 'dreamshaperXL_v21.safetensors'],
  illustrious: ['illustriousXL_v01.safetensors', 'noobaiXL_v1.1.safetensors'],
  pony: ['ponyDiffusionV6XL.safetensors'],
  flux: ['flux1-dev-fp8.safetensors', 'flux1-schnell-fp8.safetensors'],
};
export const SAMPLERS = ['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_3m_sde', 'uni_pc'];
export const SCHEDULERS = ['normal', 'karras', 'exponential', 'simple', 'sgm_uniform', 'beta'];
export const QUALITY = ['masterpiece', 'best quality', 'amazing quality', 'very aesthetic', 'absurdres', 'highres', 'newest'];
export const PHRASES = ['detailed background', 'soft lighting', 'cinematic lighting', 'beautiful detailed sky', 'depth of field', 'volumetric lighting',
  'intricate details', 'pastel colors', 'film grain', 'wide angle', 'looking at viewer', 'dynamic angle', 'atmospheric', 'serene'];
export const NEGATIVE = ['lowres', 'bad anatomy', 'bad hands', 'text', 'error', 'missing fingers', 'extra digits', 'fewer digits', 'cropped',
  'worst quality', 'low quality', 'normal quality', 'jpeg artifacts', 'signature', 'watermark', 'username', 'blurry'];
export const NEGATIVE_EXTRA = ['bad proportions', 'deformed', 'extra limbs', 'mutated hands', 'poorly drawn face', 'oversaturated', 'grainy',
  'duplicate', 'artist name', 'logo', '3d', 'realistic', 'monochrome', 'simple background', 'chromatic aberration', 'sketch'];
