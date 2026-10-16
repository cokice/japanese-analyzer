import { learningTool, toolString, ToolInputError } from '../_utils/learningTool';
import { validateCandidates } from '../../lib/learningTools';

interface Input { selection: string; context: string; segments?: string[]; }
export const POST = learningTool('resegment', 'Offer up to three distinct, useful Japanese segmentations for selection in context. Use school grammar POS labels. Preserve every character, punctuation and whitespace exactly. Each candidate has tokens with word, pos, furigana (hiragana). If segments are supplied, return exactly those words in order, only annotate POS and reading. No scores. Return {candidates:[{tokens:[...]}]}.', body => {
  const selection = toolString(body.selection, 120);
  const context = toolString(body.context, 8000);
  if (selection.includes('\n')) throw new ToolInputError('分词调整不能跨换行');
  let segments: string[] | undefined;
  if (body.segments !== undefined) {
    if (!Array.isArray(body.segments) || !body.segments.length || !body.segments.every(s => typeof s === 'string' && s.length) || body.segments.join('') !== selection) throw new ToolInputError('指定边界无效');
    segments = body.segments;
  }
  return { selection, context, segments };
}, (value, data) => { const i = data as Input; return validateCandidates(value, i.selection, i.segments); });
