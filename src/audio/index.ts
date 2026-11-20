import { WebAudioEngine } from './webAudioEngine';

export * from './types';
export { WebAudioEngine };

/** Shared singleton audio engine instance for the browser app. */
export const audioEngine = new WebAudioEngine();
