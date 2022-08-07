import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';
import got from 'got';
import {error as errorLogger} from 'website-scrap-engine/lib/logger/logger';
import type {StaticDownloadOptions} from 'website-scrap-engine/lib/options';
import type {CheerioStatic} from 'website-scrap-engine/lib/types';

// the original decrypt and restore function
// function fn({docs, data, decrypt, enc, loadingDoms}) {
//   docs.push(...(data.split('-a0a-').map(doc => {
//     return decrypt(doc, '0aa20b25-fb94-4900-9a35-be1c8f37cec4').toString(enc.Utf8);
//   })));
//   let index = 0;
//   for (let loadingDom of loadingDoms) {
//     loadingDom.innerHTML = docs[index];
//     index++;
//   }
// }
const separator = '-a0a-';
// the real key is computed inside crypto-js using some kdf
// '0aa20b25-fb94-4900-9a35-be1c8f37cec4'
const key = '0aa20b25-fb94-4900-9a35-be1c8f37cec4';

const decryptOne = (input: string): string =>
  AES.decrypt(input, key).toString(Utf8);

const decrypt = (input: string): string[] =>
  input.split(separator).map(decryptOne);

const regexp = /\.html$/;

// note this is base64 encoded text, not real ttf font
const replaceAs = '.ttf';

const fetchAndDecrypt = async (
  url: string,
  options: StaticDownloadOptions
): Promise<string[] | void> => {
  const realContentUrl = url.replace(regexp, replaceAs);
  if (realContentUrl === url) {
    errorLogger.error('fetchAndDecrypt: bad url', url);
    return;
  }

  const theGot = options?.req ? got.extend(options.req) : got;

  const resp = await theGot(realContentUrl);

  const body = resp.body;
  if (!body?.length) {
    errorLogger.error('fetchAndDecrypt: empty body', realContentUrl, resp);
    return;
  }
  return decrypt(body);
};

const asyncCache: Record<string, Promise<string[] | void>> = {};


const cachedFetchAndDecrypt = async (
  url: string,
  options: StaticDownloadOptions
): Promise<string[] | void> => {
  if (asyncCache[url] !== undefined) {
    return asyncCache[url];
  }
  return asyncCache[url] = fetchAndDecrypt(url, options);
};

export async function decryptContent(
  $: CheerioStatic, url: string, options: StaticDownloadOptions
): Promise<void> {
  // the original selector from code and the original var name
  const loadingDoms = $('#apicontent .loading');
  if (!loadingDoms.length) {
    return;
  }
  // the original var name
  let docs: string[] | void;
  try {
    docs = await cachedFetchAndDecrypt(url, options);
  } catch (e) {
    errorLogger.error('cachedFetchAndDecrypt', url, e);
    return;
  }
  if (!docs) {
    errorLogger.warn('no content found', url);
    return;
  }
  if (loadingDoms.length !== docs.length) {
    errorLogger.warn('length mismatch',
      url, loadingDoms.length, docs.length);
  }
  for (let i = 0; i < loadingDoms.length; i++) {
    const decrypted = docs[i];
    if (decrypted) {
      loadingDoms.eq(i).removeClass('loading').html(decrypted);
    }
  }
}
