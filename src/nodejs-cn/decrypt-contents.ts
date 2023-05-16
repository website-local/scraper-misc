import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';
import got from 'got';
import type {HTTPError} from 'got';
import {error as errorLogger, notFound} from 'website-scrap-engine/lib/logger/logger';
import type {StaticDownloadOptions} from 'website-scrap-engine/lib/options';
import type {CheerioStatic} from 'website-scrap-engine/lib/types';

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

  try {
    const resp = await theGot(realContentUrl);

    const body = resp.body;
    if (!body?.length) {
      errorLogger.error('fetchAndDecrypt: empty body', realContentUrl, resp);
      return;
    }
    return decrypt(body);
  } catch (e) {
    if (e && (e as HTTPError).name === 'HTTPError' &&
      (e as HTTPError).response?.statusCode === 404) {
      notFound.error(realContentUrl, url);
      return;
    }
    throw e;
  }
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
const NI_REGEX = /^\s*window\._ni\s*=\s*["']([^'"]+)["']\s*;?\s*$/;

export function decryptLinks($: CheerioStatic, url: string): void {
  let ni = '';
  $('script').each((i, el) => {
    if (ni) {
      return;
    }
    const e = $(el);
    if (e.attr('src')) {
      return;
    }
    const html = e.html();
    if (!html) {
      return;
    }
    const exec = NI_REGEX.exec(html);
    if (!exec) {
      return;
    }
    if (exec[1]) {
      ni = exec[1];
    }
  });
  if (!ni) {
    errorLogger.info('decryptLinks: ni not found', url);
    return;
  }
  $('#apicontent a').each((i, el) => {
    const e = $(el);
    const encrypted = e.attr('data-href');
    if (!encrypted) {
      return;
    }
    // const _c=CryptoJS; _hr=location.href; _cu=_c.enc.Utf8; _cp=_cu.parse; _cd=_c.AES.decrypt;
    // _t=_ele; _t2=_t.getAttribute('data-href');
    // _cd(_t2,_cp('0aa20b25fb941900-nodejs-node'), {iv:_cp(_ni.length*123), }).toString(_cu);
    try {
      const decrypted = AES.decrypt(
        encrypted, Utf8.parse('0aa20b25fb941900-nodejs-node'), {
          iv: Utf8.parse(String(ni.length * 123))
        }).toString(Utf8);
      if (decrypted) {
        e.attr('href', decrypted);
        e.removeAttr('data-href');
        e.removeAttr('target');
      }
    } catch (e) {
      errorLogger.debug('error decrypting link', encrypted, e);
    }
  });
}
