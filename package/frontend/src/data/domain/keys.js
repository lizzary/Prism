// Export template keys.
//
// Aggregate keys organise files: placed in a folder segment they group the files, placed in the last segment they
// name them. Data keys are single values of one file. Both resolve the same way; the difference is what they are for.

const L = (zh, en) => ({ 'zh-CN': zh, en });
export const pickLang = (labels, lang, fallback = '') => (labels && (labels[lang] ?? labels.en ?? labels['zh-CN'])) ?? fallback;

const GROUP_KEYS = [
  { id: 'group.name', label: L('分组名称', 'Group name') },
  { id: 'group.id', label: L('分组 ID', 'Group ID') },
  { id: 'color.name', label: L('颜色组名称', 'Colour group name') },
  { id: 'color.id', label: L('颜色组 ID', 'Colour group ID') },
];
const TIME = L('导入与导出时间', 'Import and export time');

export const AGG_GROUPS = [
  { id: 'group', label: L('分组与颜色组', 'Groups and colour groups'), keys: GROUP_KEYS },
  { id: 'time', label: TIME, keys: [
    { id: 'imported.date', label: L('导入日期', 'Import date') },
    { id: 'imported.year', label: L('导入年', 'Import year') },
    { id: 'imported.month', label: L('导入月', 'Import month') },
    { id: 'imported.day', label: L('导入日', 'Import day') },
    { id: 'imported.ym', label: L('导入年月', 'Import year–month') },
    { id: 'imported.yd', label: L('导入年日', 'Import year–day') },
    { id: 'imported.md', label: L('导入月日', 'Import month–day') },
  ] },
  { id: 'file', label: L('文件', 'File'), keys: [
    { id: 'file.ext', label: L('扩展名', 'Extension') },
  ] },
];

export const DATA_GROUPS = [
  { id: 'file', label: L('文件', 'File'), keys: [
    { id: 'file.name', label: L('原文件名', 'Original name') },
    { id: 'file.ext', label: L('扩展名', 'Extension') },
    { id: 'file.size', label: L('文件大小字节', 'Size in bytes') },
    { id: 'file.kind', label: L('媒体类型', 'Media type') },
  ] },
  { id: 'attr', label: L('文件属性', 'Properties'), keys: [
    { id: 'file.id', label: L('文件 ID', 'File ID') },
    { id: 'file.width', label: L('宽度', 'Width') },
    { id: 'file.height', label: L('高度', 'Height') },
  ] },
  { id: 'group', label: L('分组与颜色组', 'Groups and colour groups'), keys: GROUP_KEYS },
  { id: 'time', label: TIME, keys: [
    { id: 'imported.date', label: L('导入日期', 'Import date') },
    { id: 'imported.year', label: L('导入年', 'Import year') },
    { id: 'imported.month', label: L('导入月', 'Import month') },
    { id: 'imported.day', label: L('导入日', 'Import day') },
    { id: 'export.date', label: L('导出日期', 'Export date') },
    { id: 'export.time', label: L('导出时间', 'Export time') },
  ] },
  { id: 'index', label: L('文件序号', 'Numbering'), keys: [
    { id: 'index.export', label: L('导出序号', 'Export no.') },
  ] },
];

const KIND_LABEL = { image: L('图片', 'image'), video: L('视频', 'video') };

/** The key catalog in one language: { agg: [{ id, label, keys: [{ id, label }] }], data: [...] }. */
export function keyCatalog(lang) {
  const groups = (G) => G.map((g) => ({ id: g.id, label: pickLang(g.label, lang), keys: g.keys.map((k) => ({ id: k.id, label: pickLang(k.label, lang) })) }));
  return { agg: groups(AGG_GROUPS), data: groups(DATA_GROUPS) };
}

// ------------------------------------------------------------------ expansion

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** An import date as a folder name: written out the way people name folders in their language. */
function dateAgg(iso, fmt, lang) {
  const y = iso.slice(0, 4), m = iso.slice(5, 7), d = iso.slice(8, 10);
  if (lang === 'zh-CN') {
    const M = `${+m}月`, D = `${+d}日`;
    return { Y: `${y}年`, M, D, YM: `${y}年${M}`, YD: `${y}年${D}`, MD: `${M}${D}`, YMD: `${y}年${M}${D}` }[fmt];
  }
  return { Y: y, M: m, D: d, YM: `${y}-${m}`, YD: `${y}-${d}`, MD: `${m}-${d}`, YMD: `${y}-${m}-${d}` }[fmt];
}
const DATE_KEY = { 'imported.date': 'YMD', 'imported.year': 'Y', 'imported.month': 'M', 'imported.day': 'D', 'imported.ym': 'YM', 'imported.yd': 'YD', 'imported.md': 'MD' };

const stamp = (now) => ({
  date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  time: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`,
});

/**
 * The value of one key for one file.
 * ctx: { file, group, color (the file's colour group in its group's active configuration, or null), lang, now, seq, width }
 */
export function resolveKey(tok, ctx) {
  const { file, group, color, lang } = ctx;
  if (DATE_KEY[tok.id]) {
    const fmt = DATE_KEY[tok.id];
    // as a folder or a name part an aggregate date reads like a date; a data key is the plain number
    return tok.kind === 'agg' ? dateAgg(file.importedAt, fmt, lang) : dateAgg(file.importedAt, fmt, 'en');
  }
  switch (tok.id) {
    case 'group.name': return group.name;
    case 'group.id': return group.id;
    case 'color.name': return color?.name ?? '';
    case 'color.id': return color?.id ?? '';
    case 'file.name': return file.name;
    case 'file.ext': return file.ext;
    case 'file.size': return String(file.size);
    case 'file.kind': return pickLang(KIND_LABEL[file.kind], lang, file.kind);
    case 'file.id': return file.id;
    case 'file.width': return String(file.width);
    case 'file.height': return String(file.height);
    case 'export.date': return stamp(ctx.now).date;
    case 'export.time': return stamp(ctx.now).time;
    case 'index.export': return pad(ctx.seq, ctx.width);
    default: return '';
  }
}
