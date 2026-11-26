// How the statistics page was last looked at, this session: it opens the same way again — the part, the measure, the
// range of days (a preset key, or { from, to } chosen by hand), the metric of the stars, and each list's columns.
import { statsRules } from '../../../bridge/index.js';

export const statsMemory = { tab: 'storage', measure: 'size', range: statsRules.DEFAULT_RANGE, metric: 'time', partsCols: 1, filesCols: 1 };
