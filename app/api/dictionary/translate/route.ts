import { learningTool, toolString, ToolInputError } from '../../_utils/learningTool';
import { validateTranslations } from '../../../lib/learningTools';
export const POST = learningTool('dictionaryTranslation', 'Translate each supplied English dictionary sense into the requested response language. Preserve sense boundaries and exact IDs; do not select a contextual sense, add meanings or invent provenance. Return {translations:[{id,text}]}.', body => {
  if (!Array.isArray(body.senses) || !body.senses.length || body.senses.length > 10) throw new ToolInputError('每次最多翻译十个义项');
  const senses = body.senses.map(s => ({ id: toolString(s?.id, 200), text: toolString(s?.text, 4000) }));
  if (new Set(senses.map(s => s.id)).size !== senses.length) throw new ToolInputError('词典义项重复');
  return { senses };
}, (value, data) => validateTranslations(value, (data as { senses: { id: string }[] }).senses));
