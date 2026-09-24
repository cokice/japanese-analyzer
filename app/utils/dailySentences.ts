import type { TokenData } from '../services/api';
import type { Locale } from '../i18n';

export interface DailySentence {
  /** 日本时间日期 YYYY-MM-DD；备用句没有 */
  date?: string;
  text: string;
  tokens: TokenData[];
  translation: Record<Locale, string>;
}

// 首页「今日一句」的备用句：服务端每日生成失败或未配置密钥时使用。预先分好词、标好读音，不调用 AI。
const t = (word: string, pos: string, furigana?: string): TokenData => ({ word, pos, furigana });
const P = (word: string) => t(word, '記号');

export const DAILY_SENTENCES: DailySentence[] = [
  {
    text: '天気がいいから、散歩しましょう。',
    tokens: [t('天気', '名詞', 'てんき'), t('が', '助詞'), t('いい', '形容詞'), t('から', '助詞'), P('、'), t('散歩', '名詞', 'さんぽ'), t('し', '動詞'), t('ましょう', '助動詞'), P('。')],
    translation: { 'zh-CN': '天气很好，去散步吧。', 'zh-TW': '天氣很好，去散步吧。', en: "The weather's nice, so let's take a walk.", ko: '날씨가 좋으니까 산책합시다.' },
  },
  {
    text: '猫が窓の外を見ている。',
    tokens: [t('猫', '名詞', 'ねこ'), t('が', '助詞'), t('窓', '名詞', 'まど'), t('の', '助詞'), t('外', '名詞', 'そと'), t('を', '助詞'), t('見', '動詞', 'み'), t('て', '助詞'), t('いる', '動詞'), P('。')],
    translation: { 'zh-CN': '猫正看着窗外。', 'zh-TW': '貓正看著窗外。', en: 'The cat is looking out the window.', ko: '고양이가 창밖을 보고 있다.' },
  },
  {
    text: '明日は雨が降るそうです。',
    tokens: [t('明日', '名詞', 'あした'), t('は', '助詞'), t('雨', '名詞', 'あめ'), t('が', '助詞'), t('降る', '動詞', 'ふる'), t('そう', '助動詞'), t('です', '助動詞'), P('。')],
    translation: { 'zh-CN': '听说明天会下雨。', 'zh-TW': '聽說明天會下雨。', en: "I hear it's going to rain tomorrow.", ko: '내일은 비가 온대요.' },
  },
  {
    text: '春になると、桜が咲きます。',
    tokens: [t('春', '名詞', 'はる'), t('に', '助詞'), t('なる', '動詞'), t('と', '助詞'), P('、'), t('桜', '名詞', 'さくら'), t('が', '助詞'), t('咲き', '動詞', 'さき'), t('ます', '助動詞'), P('。')],
    translation: { 'zh-CN': '一到春天，樱花就会开。', 'zh-TW': '一到春天，櫻花就會開。', en: 'When spring comes, the cherry blossoms bloom.', ko: '봄이 되면 벚꽃이 핍니다.' },
  },
  {
    text: '駅まで歩いて十分ぐらいです。',
    tokens: [t('駅', '名詞', 'えき'), t('まで', '助詞'), t('歩い', '動詞', 'あるい'), t('て', '助詞'), t('十分', '名詞', 'じゅっぷん'), t('ぐらい', '助詞'), t('です', '助動詞'), P('。')],
    translation: { 'zh-CN': '走到车站大约十分钟。', 'zh-TW': '走到車站大約十分鐘。', en: "It's about a ten-minute walk to the station.", ko: '역까지 걸어서 10분 정도예요.' },
  },
  {
    text: '少しずつ上手になっていますね。',
    tokens: [t('少し', '副詞', 'すこし'), t('ずつ', '助詞'), t('上手', '形容動詞', 'じょうず'), t('に', '助動詞'), t('なっ', '動詞'), t('て', '助詞'), t('い', '動詞'), t('ます', '助動詞'), t('ね', '助詞'), P('。')],
    translation: { 'zh-CN': '你在一点点进步呢。', 'zh-TW': '你在一點一點進步呢。', en: "You're getting better little by little.", ko: '조금씩 능숙해지고 있네요.' },
  },
  {
    text: 'この本はとても面白かった。',
    tokens: [t('この', '連体詞'), t('本', '名詞', 'ほん'), t('は', '助詞'), t('とても', '副詞'), t('面白かっ', '形容詞', 'おもしろかっ'), t('た', '助動詞'), P('。')],
    translation: { 'zh-CN': '这本书非常有趣。', 'zh-TW': '這本書非常有趣。', en: 'This book was really interesting.', ko: '이 책은 정말 재미있었다.' },
  },
];

/** 「今日」按日本时间计算：所有人同一天看到同一句，日本零点换句 */
export function getJstDateKey(date = new Date()): string {
  // en-CA 的日期格式正好是 YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(date);
}

/** 日期键 → 连续天数，用于在各种列表里轮换 */
export function getDayNumber(dateKey: string): number {
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000);
}

/** 离日本时间下一个零点还有多少秒 */
export function secondsUntilJstMidnight(date = new Date()): number {
  const jstMs = date.getTime() + 9 * 3_600_000;
  return Math.max(60, Math.ceil((86_400_000 - (jstMs % 86_400_000)) / 1000));
}

/** 备用句：AI 生成不可用时按日期从预置句子里取一句 */
export function getFallbackDailySentence(date = new Date()): DailySentence {
  return DAILY_SENTENCES[getDayNumber(getJstDateKey(date)) % DAILY_SENTENCES.length];
}
