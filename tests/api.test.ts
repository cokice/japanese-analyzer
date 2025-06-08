import assert from 'assert';
import { getApiEndpoint } from '../app/services/api';

assert.strictEqual(getApiEndpoint('/analyze'), '/api/analyze');
assert.strictEqual(getApiEndpoint('/tts'), '/api/tts');
console.log('All tests passed');
