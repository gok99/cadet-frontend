import { Continuation, DelimitedContinuation } from 'js-slang/dist/cse-machine/continuations';
export { Continuation, DelimitedContinuation } from 'js-slang/dist/cse-machine/continuations';

export function isDelimitedContinuation(data: any): data is DelimitedContinuation {
  return data != null && typeof data.getEnvStack === 'function' && typeof data.id === 'string';
}

export function isContinuation(data: any): data is Continuation | DelimitedContinuation {
  if (isDelimitedContinuation(data)) return true;
  return data != null && typeof data.getEnv === 'function' && typeof data.id === 'string';
}
